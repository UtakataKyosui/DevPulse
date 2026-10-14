import { normalizeProjectSnapshot } from '@devpulse/domain/devpulse/normalize';
import {
  SNAPSHOT_SCHEMA_VERSION,
  snapshotFileSchema,
} from '@devpulse/domain/devpulse/schema';
import type { InferEnv, UnwrapConfig } from 'cf/config';
import type config from '../cloudflare.config.ts';
import { readPublishedProjects } from './config-store.ts';
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

async function github(
  path: string,
  fetcher: typeof fetch,
  token?: string,
): Promise<unknown> {
  const response = await fetcher(`https://api.github.com/repos/${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'DevPulse',
      'X-GitHub-Api-Version': '2022-11-28',
      // Never log or persist this header; it is only sent to api.github.com.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw rateLimitFrom(response) ?? new GitHubError(response.status);
  return response.json();
}

async function pages(
  path: string,
  fetcher: typeof fetch,
  token?: string,
): Promise<unknown[]> {
  const result: unknown[] = [];
  // Bound memory and subrequests; never save a silently truncated result.
  for (let page = 1; page <= 10; page++) {
    const items = await github(
      `${path}&per_page=100&page=${page}`,
      fetcher,
      token,
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
  const token = env.GITHUB_TOKEN || undefined;
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
      const repository = (await github(project.repository, fetcher, token)) as {
        private?: boolean;
        visibility?: string;
      };
      if (repository.private !== false || repository.visibility !== 'public')
        continue;
      const rawMilestones = await pages(
        `${project.repository}/milestones?state=all`,
        fetcher,
        token,
      );
      const rawIssues = await pages(
        `${project.repository}/issues?state=closed`,
        fetcher,
        token,
      );
      let lastActivityAt: string | null = null;
      try {
        const commits = (await github(
          `${project.repository}/commits?per_page=1`,
          fetcher,
          token,
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
  console.log(
    JSON.stringify({
      event: 'snapshot_sync_completed',
      count: snapshots.length,
      failures,
    }),
  );
  return {
    status: rateLimited ? 'rate_limited' : 'completed',
    count: snapshots.length,
    failures,
  };
}
