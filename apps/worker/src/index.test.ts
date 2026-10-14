import projects from '@devpulse/domain/fixtures/projects.sample.json';
import snapshots from '@devpulse/domain/fixtures/snapshots.sample.json';
import { describe, expect, it, vi } from 'vitest';
import worker from './index.ts';
import { type Env, SNAPSHOT_KEY, syncSnapshots } from './sync.ts';
import { configKv } from './test-config.ts';

function storage(initial: unknown = null) {
  let value = initial;
  const get = vi.fn(async () => value);
  const put = vi.fn(async (_key: string, json: string) => {
    value = JSON.parse(json);
  });
  return { get, put, value: () => value };
}

describe('scheduled snapshot sync', () => {
  it('paginates, normalizes and writes only public repositories', async () => {
    const kv = storage();
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/milestones?')) return Response.json([]);
      if (url.includes('/issues?'))
        return Response.json(
          new URL(url).searchParams.get('page') === '1'
            ? Array.from({ length: 100 }, (_, i) => ({
                number: i + 1,
                closed_at: '2026-10-13T00:00:00Z',
              }))
            : [],
        );
      if (url.includes('/commits?'))
        return Response.json([
          { commit: { committer: { date: '2026-10-13T00:00:00Z' } } },
        ]);
      return Response.json({
        private: false,
        visibility: url.endsWith('/private') ? 'private' : 'public',
      });
    });
    await syncSnapshots(
      { SNAPSHOTS: kv, CONFIG: configKv() } as unknown as Env,
      fetcher,
      new Date('2026-10-13T01:00:00Z'),
    );
    const data = kv.value() as typeof snapshots;
    expect(data.snapshots).toHaveLength(
      projects.projects.filter((p) => p.published).length - 1,
    );
    expect(data.snapshots[0]?.issueClosures).toHaveLength(100);
    expect(data.snapshots.every((s) => s.visibility === 'public')).toBe(true);
    expect(kv.put).toHaveBeenCalledWith(SNAPSHOT_KEY, expect.any(String));
  });

  it('sends the GitHub token only as a header and never leaks it', async () => {
    const secret = 'github_pat_SECRET_TEST_VALUE';
    const kv = storage();
    const headers: (string | null)[] = [];
    const fetcher = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        headers.push(new Headers(init?.headers).get('Authorization'));
        if (url.includes('/milestones?') || url.includes('/issues?'))
          return Response.json([]);
        if (url.includes('/commits?')) return Response.json([]);
        return Response.json({ private: false, visibility: 'public' });
      },
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await syncSnapshots(
      {
        SNAPSHOTS: kv,
        CONFIG: configKv(),
        GITHUB_TOKEN: secret,
      } as unknown as Env,
      fetcher,
      new Date('2026-10-13T01:00:00Z'),
    );
    expect(headers.length).toBeGreaterThan(0);
    expect(headers.every((h) => h === `Bearer ${secret}`)).toBe(true);
    expect(JSON.stringify(kv.value())).not.toContain(secret);
    expect(
      JSON.stringify([...log.mock.calls, ...error.mock.calls]),
    ).not.toContain(secret);
    log.mockRestore();
    error.mockRestore();
  });

  it('skips private repositories even when authenticated', async () => {
    const kv = storage();
    const fetcher = vi.fn(async () =>
      Response.json({ private: true, visibility: 'private' }),
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await syncSnapshots(
      {
        SNAPSHOTS: kv,
        CONFIG: configKv(),
        GITHUB_TOKEN: 't',
      } as unknown as Env,
      fetcher,
      new Date('2026-10-13T01:00:00Z'),
    );
    expect((kv.value() as typeof snapshots).snapshots).toHaveLength(0);
    log.mockRestore();
  });

  it('keeps successful data on transient errors but removes missing repositories', async () => {
    const now = new Date(
      snapshots.snapshots[0]?.fetchedAt ?? '2026-10-13T00:00:00Z',
    );
    const kv = storage(snapshots);
    const fetcher = vi.fn(
      async (input: string | URL | Request) =>
        new Response(null, {
          status: String(input).endsWith('/DevPulse') ? 404 : 503,
        }),
    );
    await syncSnapshots(
      { SNAPSHOTS: kv, CONFIG: configKv() } as unknown as Env,
      fetcher,
      now,
    );
    const data = kv.value() as typeof snapshots;
    expect(data.snapshots.some((s) => s.repository.endsWith('/DevPulse'))).toBe(
      false,
    );
    // DevPulse is gone (404); the private fixture snapshot is not kept either.
    expect(data.snapshots).toHaveLength(snapshots.snapshots.length - 2);
    expect(data.snapshots[0]?.fetchedAt).toBe(
      snapshots.snapshots[1]?.fetchedAt,
    );
  });

  it('returns 503 before first sync and rejects writes to the public API', async () => {
    const env = { SNAPSHOTS: storage(), CONFIG: configKv() } as unknown as Env;
    expect(
      (
        await worker.fetch(
          new Request('https://example.com/api/snapshots'),
          env,
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await worker.fetch(
          new Request('https://example.com/api/snapshots', { method: 'POST' }),
          env,
        )
      ).status,
    ).toBe(405);
  });
});

describe('KV-backed project configuration', () => {
  const [first, ...rest] = projects.projects;

  it('hides a repository from /api/snapshots and /api/projects once unpublished', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T00:00:00Z'));
    try {
      const config = configKv();
      const env = {
        SNAPSHOTS: storage(snapshots),
        CONFIG: config,
      } as unknown as Env;
      const get = async (path: string) =>
        (
          await worker.fetch(new Request(`https://example.com${path}`), env)
        ).json() as Promise<{
          snapshots?: { repository: string }[];
          projects?: { repository: string }[];
        }>;
      expect(
        (await get('/api/snapshots')).snapshots?.map((s) => s.repository),
      ).toContain(first.repository);
      expect(
        (await get('/api/projects')).projects?.map((p) => p.repository),
      ).toContain(first.repository);

      config.set([{ ...first, published: false }, ...rest]);
      expect(
        (await get('/api/snapshots')).snapshots?.map((s) => s.repository),
      ).not.toContain(first.repository);
      expect(
        (await get('/api/projects')).projects?.map((p) => p.repository),
      ).not.toContain(first.repository);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns /api/projects in tier order', async () => {
    const config = configKv([
      { ...first, tier: 'low' },
      ...rest.map((p) => ({ ...p, tier: 'medium' })),
      { ...rest[0], id: 'top', slug: 'top', repository: 'o/top', tier: 'high' },
    ]);
    const response = await worker.fetch(
      new Request('https://example.com/api/projects'),
      { SNAPSHOTS: storage(), CONFIG: config } as unknown as Env,
    );
    const body = (await response.json()) as { projects: { id: string }[] };
    expect(body.projects[0]?.id).toBe('top');
    expect(body.projects.at(-1)?.id).toBe(first.id);
  });

  it('stops syncing unpublished repositories and drops their snapshots', async () => {
    const kv = storage(snapshots);
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('?')) return Response.json([]);
      return Response.json({ private: false, visibility: 'public' });
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await syncSnapshots(
      {
        SNAPSHOTS: kv,
        CONFIG: configKv([{ ...first, published: false }, ...rest]),
      } as unknown as Env,
      fetcher,
      new Date('2026-10-13T15:00:00Z'),
    );
    const urls = fetcher.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes(first.repository))).toBe(false);
    expect(
      (kv.value() as typeof snapshots).snapshots.map((s) => s.repository),
    ).not.toContain(first.repository);
  });

  it('records an error and neither syncs nor falls back when config is missing', async () => {
    const kv = storage(snapshots);
    const fetcher = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const missing = { get: async () => null, put: async () => {} };
    await expect(
      syncSnapshots(
        { SNAPSHOTS: kv, CONFIG: missing } as unknown as Env,
        fetcher,
      ),
    ).rejects.toThrow('config:projects:v1');
    expect(fetcher).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0]?.[0])).toContain(
      'snapshot_sync_config_unavailable',
    );
    error.mockRestore();
  });

  it('answers 503 rather than a fixture when config is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = {
      SNAPSHOTS: storage(snapshots),
      CONFIG: { get: async () => null, put: async () => {} },
    } as unknown as Env;
    for (const path of ['/api/projects', '/api/snapshots'])
      expect(
        (await worker.fetch(new Request(`https://example.com${path}`), env))
          .status,
      ).toBe(503);
  });
});
