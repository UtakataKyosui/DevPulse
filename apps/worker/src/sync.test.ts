import snapshots from '@devpulse/domain/fixtures/snapshots.sample.json';
import { describe, expect, it, vi } from 'vitest';

import { ETAG_KEY } from './etag-cache.ts';
import { type Env, SNAPSHOT_KEY, syncSnapshots } from './sync.ts';
import {
  acquireSyncLock,
  releaseSyncLock,
  SYNC_LOCK_TTL_MS,
} from './sync-lock.ts';

import { configKv, database } from './test-config.ts';

function storage(initial: unknown = null) {
  const values = new Map<string, unknown>();
  if (initial) values.set(SNAPSHOT_KEY, initial);
  return {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    put: vi.fn(async (key: string, json: string) => {
      values.set(key, JSON.parse(json));
    }),
    value: () => values.get(SNAPSHOT_KEY) ?? null,
    cache: () => values.get(ETAG_KEY) ?? null,
  };
}

const okFetcher = () =>
  vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/milestones?') || url.includes('/issues?'))
      return Response.json([]);
    if (url.includes('/commits?')) return Response.json([]);
    return Response.json({ private: false, visibility: 'public' });
  });

describe('sync lock', () => {
  it('grants one holder at a time and lets an expired lease be taken over', async () => {
    const { db } = database();
    const first = await acquireSyncLock(db, 1_000);
    expect(first).not.toBeNull();
    expect(await acquireSyncLock(db, 2_000)).toBeNull();
    expect(await acquireSyncLock(db, 1_000 + SYNC_LOCK_TTL_MS - 1)).toBeNull();
    expect(await acquireSyncLock(db, 1_000 + SYNC_LOCK_TTL_MS)).not.toBeNull();
  });

  it('can be taken again after release', async () => {
    const { db } = database();
    const lease = await acquireSyncLock(db, 1_000);
    await releaseSyncLock(db, lease as string);
    expect(await acquireSyncLock(db, 1_001)).not.toBeNull();
  });

  it('skips a run while another is in progress without calling GitHub', async () => {
    const { db } = database();
    await acquireSyncLock(db, new Date('2026-10-13T01:00:00Z').getTime());
    const kv = storage();
    const fetcher = okFetcher();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await syncSnapshots(
      { SNAPSHOTS: kv, CONFIG: configKv(), REPORTS: db } as unknown as Env,
      fetcher,
      new Date('2026-10-13T01:05:00Z'),
    );
    expect(result.status).toBe('busy');
    expect(fetcher).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('releases the lock after a run, including a failing one', async () => {
    const { db } = database();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const now = new Date('2026-10-13T01:00:00Z');
    const env = {
      SNAPSHOTS: storage(),
      CONFIG: configKv(),
      REPORTS: db,
    } as unknown as Env;
    expect((await syncSnapshots(env, okFetcher(), now)).status).toBe(
      'completed',
    );
    expect(await acquireSyncLock(db, now.getTime())).not.toBeNull();
    log.mockRestore();
  });
});

describe('GitHub rate limit', () => {
  it.each([
    ['429', 429, {}],
    ['403 with no remaining quota', 403, { 'X-RateLimit-Remaining': '0' }],
    ['403 with Retry-After', 403, { 'Retry-After': '60' }],
  ])(
    'stops without retrying on %s and keeps previous snapshots',
    async (_name, status, headers) => {
      const kv = storage(snapshots);
      const fetcher = vi.fn(
        async () => new Response(null, { status, headers }),
      );
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await syncSnapshots(
        { SNAPSHOTS: kv, CONFIG: configKv() } as unknown as Env,
        fetcher,
        new Date(snapshots.snapshots[0]?.fetchedAt ?? '2026-10-13T00:00:00Z'),
      );
      expect(result.status).toBe('rate_limited');
      // The first request is rejected and nothing else is sent.
      expect(fetcher).toHaveBeenCalledTimes(1);
      const saved = kv.value() as typeof snapshots;
      expect(saved.snapshots.map((s) => s.repository)).toEqual(
        snapshots.snapshots
          .filter((s) => s.visibility === 'public')
          .map((s) => s.repository),
      );
      log.mockRestore();
      error.mockRestore();
    },
  );

  it('treats a plain 403 as a transient failure and continues', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 403 }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await syncSnapshots(
      { SNAPSHOTS: storage(), CONFIG: configKv() } as unknown as Env,
      fetcher,
      new Date('2026-10-13T01:00:00Z'),
    );
    expect(result.status).toBe('completed');
    expect(fetcher.mock.calls.length).toBeGreaterThan(1);
    log.mockRestore();
    error.mockRestore();
  });
});

describe('conditional requests', () => {
  const milestone = {
    number: 1,
    title: 'MVP',
    description: null,
    state: 'open',
    open_issues: 1,
    closed_issues: 3,
    due_on: null,
    html_url: 'https://github.com/o/r/milestone/1',
    creator: { login: 'ignored' },
  };
  const body = (url: string) => {
    if (url.includes('/milestones?')) return [milestone];
    if (url.includes('/issues?'))
      return [
        { number: 2, closed_at: '2026-10-13T00:00:00Z', body: 'drop me' },
        {
          number: 3,
          closed_at: '2026-10-13T00:00:00Z',
          pull_request: { url: 'drop' },
        },
      ];
    if (url.includes('/commits?'))
      return [{ commit: { committer: { date: '2026-10-13T00:00:00Z' } } }];
    return { private: false, visibility: 'public', owner: 'drop' };
  };
  const etagFetcher = (calls: Headers[]) =>
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push(headers);
      const url = String(input);
      if (headers.get('If-None-Match') === `"${url}"`)
        return new Response(null, { status: 304 });
      return Response.json(body(url), { headers: { ETag: `"${url}"` } });
    });
  const config = () => configKv([snapshotProject()]);
  const snapshotProject = () => ({
    id: 'p',
    slug: 'p',
    name: 'P',
    description: '',
    repository: 'o/r',
    published: true,
    lifecycle: 'active',
    tier: 'high',
  });

  it('reuses the cached body on 304 and sends the stored ETag', async () => {
    const kv = storage();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const env = { SNAPSHOTS: kv, CONFIG: config() } as unknown as Env;
    const first: Headers[] = [];
    await syncSnapshots(
      env,
      etagFetcher(first),
      new Date('2026-10-13T01:00:00Z'),
    );
    expect(first.every((h) => h.get('If-None-Match') === null)).toBe(true);
    const initial = structuredClone(kv.value()) as typeof snapshots;
    const second: Headers[] = [];
    await syncSnapshots(
      env,
      etagFetcher(second),
      new Date('2026-10-13T01:30:00Z'),
    );
    expect(second).toHaveLength(first.length);
    expect(second.every((h) => h.get('If-None-Match') !== null)).toBe(true);
    const after = kv.value() as typeof snapshots;
    expect(after.snapshots[0]?.milestones).toEqual(
      initial.snapshots[0]?.milestones,
    );
    expect(after.snapshots[0]?.issueClosures).toEqual([
      { number: 2, closedAt: '2026-10-13T00:00:00Z', isPullRequest: false },
      { number: 3, closedAt: '2026-10-13T00:00:00Z', isPullRequest: true },
    ]);
    expect(after.snapshots[0]?.fetchedAt).toBe('2026-10-13T01:30:00.000Z');
    log.mockRestore();
  });

  it('stores only the fields the sync uses and never the token', async () => {
    const kv = storage();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await syncSnapshots(
      {
        SNAPSHOTS: kv,
        CONFIG: config(),
        GITHUB_TOKEN: 'github_pat_SECRET_TEST_VALUE',
      } as unknown as Env,
      etagFetcher([]),
      new Date('2026-10-13T01:00:00Z'),
    );
    const stored = JSON.stringify(kv.cache());
    expect(stored).not.toContain('SECRET');
    expect(stored).not.toContain('drop');
    expect(stored).not.toContain('ignored');
    log.mockRestore();
  });

  it('ignores a corrupted cache and fetches unconditionally', async () => {
    const kv = storage();
    await kv.put(ETAG_KEY, JSON.stringify({ 'o/r': 'broken' }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const calls: Headers[] = [];
    await syncSnapshots(
      { SNAPSHOTS: kv, CONFIG: config() } as unknown as Env,
      etagFetcher(calls),
      new Date('2026-10-13T01:00:00Z'),
    );
    expect(calls.every((h) => h.get('If-None-Match') === null)).toBe(true);
    expect((kv.value() as typeof snapshots).snapshots).toHaveLength(1);
    log.mockRestore();
  });

  it('does not rewrite an unchanged cache', async () => {
    const kv = storage();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const env = { SNAPSHOTS: kv, CONFIG: config() } as unknown as Env;
    await syncSnapshots(env, etagFetcher([]), new Date('2026-10-13T01:00:00Z'));
    kv.put.mockClear();
    await syncSnapshots(env, etagFetcher([]), new Date('2026-10-13T01:30:00Z'));
    expect(kv.put.mock.calls.map(([key]) => key)).toEqual([SNAPSHOT_KEY]);
    log.mockRestore();
  });
});
