import { normalizeProjectSnapshot } from '@devpulse/domain/devpulse/normalize';
import {
  SNAPSHOT_SCHEMA_VERSION,
  snapshotFileSchema,
} from '@devpulse/domain/devpulse/schema';
import type { InferEnv, UnwrapConfig } from 'cf/config';
import type config from '../cloudflare.config.ts';
import { readPublishedProjects } from './config-store.ts';
import { ETAG_KEY, EtagCache } from './etag-cache.ts';
import { acquireSyncLock, releaseSyncLock } from './sync-lock.ts';

export type Env = InferEnv<UnwrapConfig<typeof config>['worker']>;
export const SNAPSHOT_KEY = 'snapshots:v1';
const MAX_AGE = 48 * 60 * 60 * 1000;

class GitHubError extends Error {
  constructor(public status: number) {
    super(`GitHub HTTP ${status}`);
  }
}

/** レート制限の応答。再試行せず、同期全体を次回に回す。 */
class RateLimitError extends GitHubError {
  constructor(
    status: number,
    public retryAfterSeconds: number | null,
    public resetAt: string | null,
  ) {
    super(status);
    this.message = `GitHub rate limit (HTTP ${status})`;
  }
}

function rateLimitFrom(response: Response): RateLimitError | null {
  const retryAfter = response.headers.get('Retry-After');
  const limited =
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get('X-RateLimit-Remaining') === '0' ||
        retryAfter !== null));
  if (!limited) return null;
  const reset = Number(response.headers.get('X-RateLimit-Reset'));
  return new RateLimitError(
    response.status,
    retryAfter !== null && Number.isFinite(Number(retryAfter))
      ? Number(retryAfter)
      : null,
    Number.isFinite(reset) && reset > 0
      ? new Date(reset * 1000).toISOString()
      : null,
  );
}

type Project = (body: unknown) => unknown;

/** 同期に使う項目だけを残す。ETag キャッシュに保存する本文を小さく保つ。 */
const projectRepository: Project = (body) => {
  const { private: isPrivate, visibility } = (body ?? {}) as {
    private?: unknown;
    visibility?: unknown;
  };
  return { private: isPrivate, visibility };
};
const projectList =
  (project: (item: Record<string, unknown>) => unknown): Project =>
  (body) =>
    Array.isArray(body) ? body.map((item) => project(item ?? {})) : body;
const projectMilestones = projectList((m) => ({
  number: m.number,
  title: m.title,
  description: m.description,
  state: m.state,
  open_issues: m.open_issues,
  closed_issues: m.closed_issues,
  due_on: m.due_on,
  html_url: m.html_url,
}));
const projectIssues = projectList((i) => ({
  number: i.number,
  closed_at: i.closed_at,
  ...(i.pull_request !== undefined ? { pull_request: {} } : {}),
}));
const projectCommits = projectList((c) => ({
  commit: {
    committer: {
      date: (c.commit as { committer?: { date?: unknown } } | undefined)
        ?.committer?.date,
    },
  },
}));

type Client = {
  fetcher: typeof fetch;
  token?: string;
  cache: EtagCache;
  /** 304 の実コストを記録するための観測値。 */
  stats: { notModified: number; rateLimitRemaining: number | null };
};

/** 条件付きリクエストで取得し、304 なら前回保存した本文を返す。 */
async function github(
  path: string,
  { fetcher, token, cache, stats }: Client,
  project: Project,
): Promise<unknown> {
  const cached = cache.get(path);
  const response = await fetcher(`https://api.github.com/repos/${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'DevPulse',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(cached ? { 'If-None-Match': cached.etag } : {}),
      // Never log or persist this header; it is only sent to api.github.com.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const remaining = response.headers.get('X-RateLimit-Remaining');
  if (remaining !== null && Number.isFinite(Number(remaining)))
    stats.rateLimitRemaining = Number(remaining);
  if (response.status === 304 && cached) {
    stats.notModified++;
    return cached.body;
  }
  if (!response.ok)
    throw rateLimitFrom(response) ?? new GitHubError(response.status);
  const body = project(await response.json());
  const etag = response.headers.get('ETag');
  if (etag) cache.set(path, etag, body);
  return body;
}

async function pages(
  path: string,
  client: Client,
  project: Project,
): Promise<unknown[]> {
  const result: unknown[] = [];
  // Bound memory and subrequests; never save a silently truncated result.
  for (let page = 1; page <= 10; page++) {
    const items = await github(
      `${path}&per_page=100&page=${page}`,
      client,
      project,
    );
    if (!Array.isArray(items)) throw new Error('Invalid GitHub list');
    result.push(...items);
    if (items.length < 100) return result;
  }
  throw new Error('GitHub pagination limit exceeded');
}

export type SyncResult = {
  status: 'completed' | 'busy' | 'rate_limited';
  count: number;
  failures: number;
};

/**
 * 公開 Snapshot を同期する。同時に 1 つだけ実行し、他が実行中なら何もせず `busy` を返す。
 * レート制限を受けたら再試行せずに中断し、未更新のリポジトリは最後の成功データを保持する。
 */
export async function syncSnapshots(
  env: Pick<Env, 'SNAPSHOTS' | 'CONFIG'> & {
    REPORTS?: Env['REPORTS'];
    GITHUB_TOKEN?: string;
  },
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<SyncResult> {
  const db = env.REPORTS;
  const lease = db ? await acquireSyncLock(db, now.getTime()) : null;
  if (db && !lease) {
    console.log(JSON.stringify({ event: 'snapshot_sync_busy' }));
    return { status: 'busy', count: 0, failures: 0 };
  }
  try {
    return await synchronize(env, fetcher, now);
  } finally {
    if (db && lease) await releaseSyncLock(db, lease);
  }
}

async function synchronize(
  env: Pick<Env, 'SNAPSHOTS' | 'CONFIG'> & { GITHUB_TOKEN?: string },
  fetcher: typeof fetch,
  now: Date,
): Promise<SyncResult> {
  // 設定が無い・不正なときは何も書かず(既存 Snapshot も保持)、fixture へは戻さない。
  let projects: Awaited<ReturnType<typeof readPublishedProjects>>;
  try {
    projects = await readPublishedProjects(env.CONFIG);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'snapshot_sync_config_unavailable',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
    throw error;
  }
  const previous = snapshotFileSchema.parse(
    (await env.SNAPSHOTS.get(SNAPSHOT_KEY, 'json')) ?? { snapshots: [] },
  );
  const cache = EtagCache.parse(await env.SNAPSHOTS.get(ETAG_KEY, 'json'));
  const client: Client = {
    fetcher,
    token: env.GITHUB_TOKEN || undefined,
    cache,
    stats: { notModified: 0, rateLimitRemaining: null },
  };
  const snapshots = [];
  let failures = 0;
  let rateLimited = false;
  const keepPrevious = (repository: string) => {
    const old = previous.snapshots.find(
      (s) => s.repository === repository && s.visibility === 'public',
    );
    if (old && now.getTime() - Date.parse(old.fetchedAt) < MAX_AGE)
      snapshots.push(old);
  };
  for (const [index, project] of projects.entries()) {
    try {
      const repository = (await github(
        project.repository,
        client,
        projectRepository,
      )) as {
        private?: boolean;
        visibility?: string;
      };
      if (repository.private !== false || repository.visibility !== 'public')
        continue;
      const rawMilestones = await pages(
        `${project.repository}/milestones?state=all`,
        client,
        projectMilestones,
      );
      const rawIssues = await pages(
        `${project.repository}/issues?state=closed`,
        client,
        projectIssues,
      );
      let lastActivityAt: string | null = null;
      try {
        const commits = (await github(
          `${project.repository}/commits?per_page=1`,
          client,
          projectCommits,
        )) as { commit: { committer: { date: string } } }[];
        lastActivityAt = commits[0]?.commit.committer.date ?? null;
      } catch (error) {
        if (!(error instanceof GitHubError && error.status === 409))
          throw error;
      }
      snapshots.push(
        normalizeProjectSnapshot({
          repository: project.repository,
          visibility: 'public',
          rawMilestones,
          rawIssues,
          lastActivityAt,
          fetchedAt: now.toISOString(),
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'snapshot_sync_failed',
          repository: project.repository,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
      if (error instanceof RateLimitError) {
        // Do not retry or call GitHub again: carry over every repository not yet refreshed.
        console.error(
          JSON.stringify({
            event: 'snapshot_sync_rate_limited',
            retryAfterSeconds: error.retryAfterSeconds,
            resetAt: error.resetAt,
          }),
        );
        rateLimited = true;
        for (const rest of projects.slice(index)) keepPrevious(rest.repository);
        failures += projects.length - index;
        break;
      }
      // A missing/private repository must disappear; it is removed on purpose, not a failed sync.
      if (error instanceof GitHubError && error.status === 404) continue;
      failures++;
      keepPrevious(project.repository);
    }
  }
  const data = snapshotFileSchema.parse({
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    lastSuccessAt:
      failures === 0 ? now.toISOString() : (previous.lastSuccessAt ?? null),
    snapshots,
  });
  await env.SNAPSHOTS.put(SNAPSHOT_KEY, JSON.stringify(data));
  cache.retain(projects.map((p) => p.repository));
  if (cache.dirty) {
    // The cache only saves requests; a failed write must not fail a completed sync.
    try {
      await env.SNAPSHOTS.put(ETAG_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'snapshot_sync_cache_write_failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
    }
  }
  console.log(
    JSON.stringify({
      event: 'snapshot_sync_completed',
      count: snapshots.length,
      failures,
      notModified: client.stats.notModified,
      rateLimitRemaining: client.stats.rateLimitRemaining,
    }),
  );
  return {
    status: rateLimited ? 'rate_limited' : 'completed',
    count: snapshots.length,
    failures,
  };
}
