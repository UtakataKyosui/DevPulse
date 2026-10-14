import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import projectsJson from '../data/devpulse/projects.json';
import { collectReportInput, type Report } from '../lib/reports/model.ts';
import worker from './index.ts';
import { ReportStore } from './report-store.ts';
import {
  canPublish,
  generateDailyReport,
  REPORT_MODEL,
  reportsAuthorized,
} from './reports.ts';
import type { Env } from './sync.ts';
import { configKv } from './test-config.ts';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    prepare(sql: string) {
      let args: (string | number | null)[] = [];
      const statement = {
        bind(...values: (string | number | null)[]) {
          args = values;
          return statement;
        },
        async run() {
          const result = sqlite.prepare(sql).run(...args);
          return { meta: { changes: Number(result.changes) } };
        },
        async first() {
          return sqlite.prepare(sql).get(...args) ?? null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...args) };
        },
      };
      return statement;
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      return Promise.all(statements.map((s) => s.run()));
    },
  };
  return { sqlite, db: db as unknown as Env['REPORTS'] };
}

function environment() {
  const { sqlite, db } = database();
  const values = new Map<string, unknown>();
  const env = {
    REPORTS: db,
    CONFIG: configKv(),
    REPORTS_TOKEN: 't'.repeat(32),
    REPORT_SETTINGS: {
      model: REPORT_MODEL,
      maxTokens: 1200,
      maxInputChars: 24000,
    },
    SNAPSHOTS: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        values.set(key, JSON.parse(value));
      }),
    },
    AI: {
      run: vi.fn(async () => ({
        response: '対象期間に Issue のクローズはありません。',
      })),
    },
    ASSETS: { fetch: vi.fn(async () => new Response('asset')) },
  };
  return { env: env as unknown as Env, mocks: env, sqlite };
}

function report(): Report {
  return {
    input: collectReportInput(
      '2026-10-13',
      [],
      [],
      null,
      new Date('2026-10-14T00:00:00Z'),
    ),
    summary: '進捗なし',
    publishedAt: '2026-10-14T00:00:00.000Z',
    model: REPORT_MODEL,
    promptVersion: 1,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('D1 daily generation', () => {
  it('uses real SQLite to arbitrate claims, recover an expired lease and bound attempts', async () => {
    const { db } = database();
    const store = new ReportStore(db);
    await store.initialize();
    const leases = await Promise.all([
      store.claim('2026-10-13', 0),
      store.claim('2026-10-13', 0),
    ]);
    expect(leases.filter(Boolean)).toHaveLength(1);
    const first = leases.find(Boolean) as string;
    const second = await store.claim('2026-10-13', 600001);
    expect(second).toBeTruthy();
    await expect(store.complete('2026-10-13', first, report())).rejects.toThrow(
      'lease lost',
    );
    await store.release('2026-10-13', second as string);
    const third = await store.claim('2026-10-13', 600002);
    await store.release('2026-10-13', third as string);
    expect(await store.claim('2026-10-13', 600003)).toBeNull();
    await store.resetAttempts('2026-10-13', 600003);
    expect(await store.claim('2026-10-13', 600003)).toBeTruthy();
  });

  it('preserves captured facts across AI failure, generates once and publishes without AI reruns', async () => {
    const { env, mocks, sqlite } = environment();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) =>
        input.includes('?')
          ? Response.json([])
          : Response.json({ private: false, visibility: 'public' }),
      ),
    );
    mocks.AI.run.mockRejectedValueOnce(new Error('upstream failure'));
    await expect(
      generateDailyReport(env, new Date('2026-10-14T00:00:00Z')),
    ).rejects.toThrow('upstream failure');
    expect(
      await generateDailyReport(env, new Date('2026-10-14T01:00:00Z')),
    ).toBe('generated');
    expect(
      await generateDailyReport(env, new Date('2026-10-14T02:00:00Z')),
    ).toBe('ready');
    expect(mocks.AI.run).toHaveBeenCalledTimes(2);
    const store = new ReportStore(env.REPORTS);
    const saved = await store.get('2026-10-13');
    expect(saved?.publishedAt).toBe('2026-10-14T00:00:00.000Z');
    await store.acknowledge(['2026-10-13'], '2026-10-14T03:00:00Z');
    await store.acknowledge(['2026-10-13'], '2026-10-14T04:00:00Z');
    expect(
      sqlite.prepare('SELECT published_at FROM daily_reports').get()
        ?.published_at,
    ).toBe('2026-10-14T03:00:00Z');
    expect(await store.get('2026-10-13')).toEqual(saved);
  });

  it('builds a new report only from repositories published in KV at generation time', async () => {
    const { env, mocks } = environment();
    const [hidden, ...others] = projectsJson.projects;
    mocks.CONFIG.set([{ ...hidden, published: false }, ...others]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) =>
        input.includes('?')
          ? Response.json([])
          : Response.json({ private: false, visibility: 'public' }),
      ),
    );
    await generateDailyReport(env, new Date('2026-10-14T00:00:00Z'));
    const saved = await new ReportStore(env.REPORTS).get('2026-10-13');
    const repositories = saved?.input.projects.map((p) => p.repository);
    expect(repositories).not.toContain(hidden.repository);
    expect(repositories).toHaveLength(others.length);
  });

  it('rejects invalid model output without storing a ready report', async () => {
    const { env, mocks } = environment();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ private: true, visibility: 'private' }),
      ),
    );
    mocks.AI.run.mockResolvedValueOnce({ response: '' });
    await expect(
      generateDailyReport(env, new Date('2026-10-14T00:00:00Z')),
    ).rejects.toThrow();
    expect(await new ReportStore(env.REPORTS).get('2026-10-13')).toBeNull();
  });
});

describe('publication access', () => {
  it('exports saved reports without consuming the hourly GitHub API budget', async () => {
    const { env } = environment();
    const store = new ReportStore(env.REPORTS);
    await store.initialize();
    const saved = report();
    const lease = await store.claim(saved.input.date, 0);
    await store.complete(saved.input.date, lease as string, saved);
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const response = await worker.fetch(
      new Request('https://example.com/api/reports', {
        headers: { Authorization: `Bearer ${env.REPORTS_TOKEN}` },
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reports: [saved],
      nextCursor: null,
    });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('lets the daily trigger own the overlapping hourly refresh', async () => {
    const { env } = environment();
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    await worker.scheduled(
      { cron: '0 * * * *', scheduledTime: Date.parse('2026-10-14T12:00:00Z') },
      env,
    );
    expect(upstream).not.toHaveBeenCalled();
  });

  it('does not generate before 21:00 JST and retries at 22:00 JST', async () => {
    const { env, mocks } = environment();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) =>
        input.includes('?')
          ? Response.json([])
          : Response.json({ private: false, visibility: 'public' }),
      ),
    );
    await worker.scheduled(
      { cron: '0 * * * *', scheduledTime: Date.parse('2026-10-14T11:00:00Z') },
      env,
    );
    expect(mocks.AI.run).not.toHaveBeenCalled();
    await worker.scheduled(
      { cron: '0 * * * *', scheduledTime: Date.parse('2026-10-14T13:00:00Z') },
      env,
    );
    expect(mocks.AI.run).toHaveBeenCalledOnce();
    expect(
      (await new ReportStore(env.REPORTS).get('2026-10-13'))?.publishedAt,
    ).toBe('2026-10-14T13:00:00.000Z');
  });

  it('requires a long configured token and exact bearer authentication', async () => {
    expect(
      await reportsAuthorized(new Request('https://example.com'), undefined),
    ).toBe(false);
    const token = 's'.repeat(32);
    expect(
      await reportsAuthorized(
        new Request('https://example.com', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        token,
      ),
    ).toBe(true);
    expect(
      await reportsAuthorized(
        new Request('https://example.com', {
          headers: { Authorization: `Bearer ${token}x` },
        }),
        token,
      ),
    ).toBe(false);
    const { env } = environment();
    expect(
      (await worker.fetch(new Request('https://example.com/api/reports'), env))
        .status,
    ).toBe(401);
  });

  it('withdraws an entire report when any included repository is no longer public', () => {
    const saved = report();
    saved.input.projects = [
      {
        repository: 'owner/repo',
        name: 'Example',
        fetchedAt: saved.publishedAt,
        stale: false,
        closedIssues: 0,
        milestoneNumber: null,
        progress: null,
        progressDelta: null,
        health: 'unknown',
        deadline: 'none',
      },
    ];
    expect(canPublish(saved, new Set(['owner/repo']))).toBe(true);
    expect(canPublish(saved, new Set())).toBe(false);
  });

  it('blocks stale article/feed assets until safe republication', async () => {
    const { env, mocks } = environment();
    const saved = report();
    saved.input.projects = [
      {
        repository: 'owner/repo',
        name: 'Example',
        fetchedAt: saved.publishedAt,
        stale: false,
        closedIssues: 0,
        milestoneNumber: null,
        progress: null,
        progressDelta: null,
        health: 'unknown',
        deadline: 'none',
      },
    ];
    const store = new ReportStore(env.REPORTS);
    await store.initialize();
    const lease = await store.claim(saved.input.date, 0);
    await store.complete(saved.input.date, lease as string, saved);
    expect(
      (
        await worker.fetch(
          new Request('https://example.com/reports/2026-10-13/'),
          env,
        )
      ).status,
    ).toBe(404);
    mocks.ASSETS.fetch.mockResolvedValueOnce(Response.json(['2026-10-13']));
    expect(
      (
        await worker.fetch(
          new Request('https://example.com/rss/reports.xml'),
          env,
        )
      ).status,
    ).toBe(503);
    for (const path of [
      '/',
      '/index.html',
      '/reports/',
      '/reports/index.html',
    ]) {
      mocks.ASSETS.fetch.mockResolvedValueOnce(Response.json(['2026-10-13']));
      expect(
        (await worker.fetch(new Request(`https://example.com${path}`), env))
          .status,
      ).toBe(503);
      mocks.ASSETS.fetch
        .mockResolvedValueOnce(Response.json([]))
        .mockResolvedValueOnce(new Response('overview'));
      const overview = await worker.fetch(
        new Request(`https://example.com${path}`),
        env,
      );
      expect(overview.status).toBe(200);
      expect(overview.headers.get('Cache-Control')).toBe('no-store');
    }
    mocks.ASSETS.fetch
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(new Response('<rss/>'));
    const response = await worker.fetch(
      new Request('https://example.com/rss/reports.xml'),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain(
      'application/rss+xml',
    );
  });
});
