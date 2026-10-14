import { z } from 'zod';
import { repositoryKey } from '../lib/devpulse/repository-key.ts';
import {
  projectConfigSchema,
  projectDefinitionSchema,
} from '../lib/devpulse/schema.ts';
import type { ProjectDefinition } from '../lib/devpulse/types.ts';
import { type AdminAuthEnv, authorizeAdmin } from './admin-auth.ts';
import {
  ConfigConflictError,
  ConfigInvalidError,
  type ConfigKv,
  ConfigMissingError,
  readProjectConfig,
  writeProjectConfig,
} from './config-store.ts';

export type AdminApiEnv = AdminAuthEnv & {
  CONFIG: ConfigKv;
  /** Workers の設定値。ログインユーザーから導出しない。 */
  ADMIN_SETTINGS: { githubOwner: string };
  GITHUB_TOKEN?: string;
};

type FieldError = { path: string; message: string };

const MAX_BODY_BYTES = 256 * 1024;
const MUTATING = new Set(['POST', 'PUT', 'DELETE']);

const requestSchema = z.object({
  revision: z.number().int().positive(),
  projects: z.array(z.unknown()),
});

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extra },
  });
}

function fieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

class GitHubLookupError extends Error {
  status: number;
  constructor(status: number) {
    super(`GitHub HTTP ${status}`);
    this.status = status;
  }
}

async function github(
  path: string,
  env: AdminApiEnv,
  fetcher: typeof fetch,
): Promise<unknown> {
  const response = await fetcher(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'DevPulse',
      'X-GitHub-Api-Version': '2022-11-28',
      // Never log or persist this header; it is only sent to api.github.com.
      ...(env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` }
        : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new GitHubLookupError(response.status);
  return response.json();
}

const repoInfoSchema = z.object({
  full_name: z.string(),
  private: z.boolean(),
  visibility: z.string().optional(),
  description: z.string().nullable().optional(),
});

function isPublic(repo: z.infer<typeof repoInfoSchema>): boolean {
  return repo.private === false && (repo.visibility ?? 'public') === 'public';
}

/** 追加候補: 固定した owner の public リポジトリのうち、未登録のもの。 */
async function listCandidates(
  env: AdminApiEnv,
  fetcher: typeof fetch,
  registered: ProjectDefinition[],
) {
  const owner = env.ADMIN_SETTINGS.githubOwner;
  const known = new Set(registered.map((p) => repositoryKey(p.repository)));
  const repos: z.infer<typeof repoInfoSchema>[] = [];
  // Bound subrequests; never return a silently truncated list.
  for (let page = 1; page <= 10; page++) {
    const items = z
      .array(repoInfoSchema)
      .parse(
        await github(
          `/users/${encodeURIComponent(owner)}/repos?type=owner&per_page=100&page=${page}`,
          env,
          fetcher,
        ),
      );
    repos.push(...items);
    if (items.length < 100) {
      return repos
        .filter((r) => isPublic(r) && !known.has(repositoryKey(r.full_name)))
        .map((r) => ({
          repository: r.full_name,
          description: r.description ?? '',
        }));
    }
  }
  throw new Error('GitHub pagination limit exceeded');
}

/** slug は作成後変更不可。id で既存プロジェクトと突き合わせる。 */
function slugErrors(
  next: ProjectDefinition[],
  current: ProjectDefinition[],
): FieldError[] {
  const errors: FieldError[] = [];
  next.forEach((project, index) => {
    const before = current.find((p) => p.id === project.id);
    if (before && before.slug !== project.slug)
      errors.push({
        path: `projects.${index}.slug`,
        message: `slug is immutable (expected "${before.slug}")`,
      });
  });
  return errors;
}

/** 新規追加または新たに公開するリポジトリが、固定 owner の public であることを確認する。 */
async function publicityErrors(
  next: ProjectDefinition[],
  current: ProjectDefinition[],
  env: AdminApiEnv,
  fetcher: typeof fetch,
): Promise<FieldError[]> {
  const owner = env.ADMIN_SETTINGS.githubOwner.toLowerCase();
  const errors: FieldError[] = [];
  for (const [index, project] of next.entries()) {
    const before = current.find((p) => p.id === project.id);
    const added = !before || before.repository !== project.repository;
    const newlyPublished = project.published && !before?.published;
    if (!added && !newlyPublished) continue;
    const path = `projects.${index}.repository`;
    if (added && project.repository.split('/')[0]?.toLowerCase() !== owner) {
      errors.push({
        path,
        message: `repository owner must be ${env.ADMIN_SETTINGS.githubOwner}`,
      });
      continue;
    }
    try {
      const repo = repoInfoSchema.parse(
        await github(`/repos/${project.repository}`, env, fetcher),
      );
      if (!isPublic(repo))
        errors.push({ path, message: 'repository is not public' });
    } catch (error) {
      if (error instanceof GitHubLookupError && error.status === 404)
        errors.push({ path, message: 'repository is not public' });
      else throw error;
    }
  }
  return errors;
}

async function putConfig(
  request: Request,
  env: AdminApiEnv,
  fetcher: typeof fetch,
  email: string,
): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success)
    return json(
      { error: 'validation', errors: fieldErrors(parsed.error) },
      422,
    );

  const current = await readProjectConfig(env.CONFIG);
  if (parsed.data.revision !== current.revision)
    return json({ error: 'conflict', revision: current.revision }, 409);

  const config = projectConfigSchema.safeParse({
    projects: parsed.data.projects,
  });
  if (!config.success)
    return json(
      { error: 'validation', errors: fieldErrors(config.error) },
      422,
    );

  const errors = [
    ...slugErrors(config.data.projects, current.projects),
    ...(await publicityErrors(
      config.data.projects,
      current.projects,
      env,
      fetcher,
    )),
  ];
  if (errors.length > 0) return json({ error: 'validation', errors }, 422);

  const saved = await writeProjectConfig(env.CONFIG, {
    projects: config.data.projects,
    expectedRevision: current.revision,
    updatedBy: email,
  });
  return json(saved);
}

/** 新規追加プロジェクトの初期値。UI は候補選択時にこれを使う。 */
export function newProjectDefaults(
  repository: string,
  description: string,
): ProjectDefinition {
  const repo = repository.split('/')[1] ?? repository;
  const slug = repo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return projectDefinitionSchema.parse({
    id: slug,
    slug,
    name: repo,
    description,
    repository,
    published: false,
    lifecycle: 'planned',
    tier: 'low',
  });
}

/** `/api/admin/*` の入口。Access 認可を最初に通す。 */
export async function handleAdminApi(
  request: Request,
  env: AdminApiEnv,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const auth = await authorizeAdmin(request, env, fetcher);
  if (!auth.ok)
    return new Response(auth.status === 401 ? 'Unauthorized' : 'Forbidden', {
      status: auth.status,
      headers: { 'Cache-Control': 'no-store' },
    });

  const url = new URL(request.url);
  const path = url.pathname.toLowerCase().replace(/\/+$/, '');
  const method = request.method;
  if (MUTATING.has(method) && request.headers.get('Origin') !== url.origin)
    return json({ error: 'origin_mismatch' }, 403);

  const route =
    path === '/api/admin/config'
      ? { allow: 'GET, PUT' }
      : path === '/api/admin/candidates'
        ? { allow: 'GET' }
        : null;
  if (!route) return json({ error: 'not_found' }, 404);
  if (!route.allow.split(', ').includes(method))
    return json({ error: 'method_not_allowed' }, 405, { Allow: route.allow });

  try {
    if (path === '/api/admin/config') {
      if (method === 'PUT')
        return await putConfig(request, env, fetcher, auth.email);
      return json(await readProjectConfig(env.CONFIG));
    }
    const current = await readProjectConfig(env.CONFIG);
    const candidates = await listCandidates(env, fetcher, current.projects);
    return json({
      candidates: candidates.map((c) => ({
        ...c,
        defaults: newProjectDefaults(c.repository, c.description),
      })),
    });
  } catch (error) {
    if (error instanceof ConfigConflictError)
      return json({ error: 'conflict', revision: error.actual }, 409);
    if (
      error instanceof ConfigMissingError ||
      error instanceof ConfigInvalidError
    )
      return json({ error: 'config_unavailable' }, 503);
    console.error(
      JSON.stringify({
        event: 'admin_api_failed',
        path,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
    return json(
      {
        error:
          error instanceof GitHubLookupError
            ? 'github_unavailable'
            : 'internal',
      },
      error instanceof GitHubLookupError ? 502 : 500,
    );
  }
}
