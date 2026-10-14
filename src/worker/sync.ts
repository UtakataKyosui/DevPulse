import type { InferEnv, UnwrapConfig } from 'cf/config';
import type config from '../../cloudflare.config.ts';
import { normalizeProjectSnapshot } from '../lib/devpulse/normalize.ts';
import { snapshotFileSchema } from '../lib/devpulse/schema.ts';
import { readPublishedProjects } from './config-store.ts';

export type Env = InferEnv<UnwrapConfig<typeof config>['worker']>;
export const SNAPSHOT_KEY = 'snapshots:v1';
const MAX_AGE = 48 * 60 * 60 * 1000;

class GitHubError extends Error {
  constructor(public status: number) {
    super(`GitHub HTTP ${status}`);
  }
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
  if (!response.ok) throw new GitHubError(response.status);
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

export async function syncSnapshots(
  env: Pick<Env, 'SNAPSHOTS' | 'CONFIG'> & { GITHUB_TOKEN?: string },
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<void> {
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
  for (const project of projects) {
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
      failures++;
      console.error(
        JSON.stringify({
          event: 'snapshot_sync_failed',
          repository: project.repository,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
      // A missing/private repository must disappear; transient errors keep the last successful data.
      if (error instanceof GitHubError && error.status === 404) continue;
      const old = previous.snapshots.find(
        (s) => s.repository === project.repository && s.visibility === 'public',
      );
      if (old && now.getTime() - Date.parse(old.fetchedAt) < MAX_AGE)
        snapshots.push(old);
    }
  }
  const data = snapshotFileSchema.parse({ snapshots });
  await env.SNAPSHOTS.put(SNAPSHOT_KEY, JSON.stringify(data));
  console.log(
    JSON.stringify({
      event: 'snapshot_sync_completed',
      count: snapshots.length,
      failures,
    }),
  );
}
