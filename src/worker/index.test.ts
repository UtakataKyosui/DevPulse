import { describe, expect, it, vi } from 'vitest';
import projects from '../data/devpulse/projects.json';
import snapshots from '../data/devpulse/snapshots.json';
import worker from './index.ts';
import { type Env, SNAPSHOT_KEY, syncSnapshots } from './sync.ts';

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
        visibility: url.endsWith('/LifeBoard') ? 'private' : 'public',
      });
    });
    await syncSnapshots(
      { SNAPSHOTS: kv } as unknown as Env,
      fetcher,
      new Date('2026-10-13T01:00:00Z'),
    );
    const data = kv.value() as typeof snapshots;
    expect(data.snapshots).toHaveLength(projects.projects.length - 1);
    expect(data.snapshots[0]?.issueClosures).toHaveLength(100);
    expect(data.snapshots.every((s) => s.visibility === 'public')).toBe(true);
    expect(kv.put).toHaveBeenCalledWith(SNAPSHOT_KEY, expect.any(String));
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
    await syncSnapshots({ SNAPSHOTS: kv } as unknown as Env, fetcher, now);
    const data = kv.value() as typeof snapshots;
    expect(data.snapshots.some((s) => s.repository.endsWith('/DevPulse'))).toBe(
      false,
    );
    expect(data.snapshots).toHaveLength(snapshots.snapshots.length - 1);
    expect(data.snapshots[0]?.fetchedAt).toBe(
      snapshots.snapshots[1]?.fetchedAt,
    );
  });

  it('returns 503 before first sync and rejects writes to the public API', async () => {
    const env = { SNAPSHOTS: storage() } as unknown as Env;
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
