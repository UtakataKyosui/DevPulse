import snapshots from '@devpulse/domain/fixtures/snapshots.sample.json';
import { describe, expect, it, vi } from 'vitest';
import { type Env, syncSnapshots } from './sync.ts';
import {
  acquireSyncLock,
  releaseSyncLock,
  SYNC_LOCK_TTL_MS,
} from './sync-lock.ts';
import { configKv, database } from './test-config.ts';

function storage(initial: unknown = null) {
  let value = initial;
  return {
    get: vi.fn(async () => value),
    put: vi.fn(async (_key: string, json: string) => {
      value = JSON.parse(json);
    }),
    value: () => value,
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
