import { describe, expect, it, vi } from 'vitest';
import projectsJson from '../data/devpulse/projects.json';
import { type AdminApiEnv, handleAdminApi } from './admin-api.ts';
import { readProjectConfig, writeProjectConfig } from './config-store.ts';
import worker from './index.ts';

const ORIGIN = 'http://localhost:8787';
const OWNER = 'UtakataKyosui';
const projects = projectsJson.projects;

function kv(initial: string | null = null) {
  let value = initial;
  const get = vi.fn(async () => value);
  const put = vi.fn(async (_key: string, text: string) => {
    value = text;
  });
  return { get, put };
}

async function setup() {
  const store = kv();
  await writeProjectConfig(store, {
    projects,
    expectedRevision: null,
    updatedBy: 'seed',
  });
  const env: AdminApiEnv = {
    CONFIG: store,
    ADMIN_SETTINGS: { githubOwner: OWNER },
    GITHUB_TOKEN: 'github_pat_SECRET',
    ADMIN_AUTH_BYPASS: '1',
  };
  return { store, env };
}

function github(repos: Record<string, { private: boolean }>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.startsWith('/users/'))
      return Response.json(
        Object.entries(repos).map(([full_name, r]) => ({
          full_name,
          private: r.private,
          visibility: r.private ? 'private' : 'public',
          description: 'desc',
        })),
      );
    const name = url.pathname.replace('/repos/', '');
    const repo = repos[name];
    if (!repo) return new Response(null, { status: 404 });
    return Response.json({
      full_name: name,
      private: repo.private,
      visibility: repo.private ? 'private' : 'public',
    });
  });
}

function call(
  env: AdminApiEnv,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = { Origin: ORIGIN },
  fetcher: typeof fetch = github({}) as unknown as typeof fetch,
) {
  return handleAdminApi(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    fetcher,
  );
}

const newProject = {
  id: 'new-repo',
  slug: 'new-repo',
  name: 'new-repo',
  description: '',
  repository: `${OWNER}/new-repo`,
  published: false,
  lifecycle: 'planned',
  tier: 'low',
};

describe('admin API', () => {
  it('returns the current config with no-store', async () => {
    const { env } = await setup();
    const response = await call(env, 'GET', '/api/admin/config');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = (await response.json()) as { revision: number };
    expect(body.revision).toBe(1);
  });

  it('saves a valid config, adds a new public repository, and bumps revision', async () => {
    const { env, store } = await setup();
    const fetcher = github({
      [`${OWNER}/new-repo`]: { private: false },
    }) as unknown as typeof fetch;
    const response = await call(
      env,
      'PUT',
      '/api/admin/config',
      { revision: 1, projects: [...projects, newProject] },
      { Origin: ORIGIN },
      fetcher,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const saved = await readProjectConfig(store);
    expect(saved.revision).toBe(2);
    expect(saved.updatedBy).toBe('local-bypass');
    expect(saved.projects.at(-1)).toMatchObject({
      published: false,
      tier: 'low',
    });
  });

  it('returns 409 on a stale revision without writing', async () => {
    const { env, store } = await setup();
    store.put.mockClear();
    const response = await call(env, 'PUT', '/api/admin/config', {
      revision: 7,
      projects,
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ revision: 1 });
    expect(store.put).not.toHaveBeenCalled();
  });

  it('reports schema errors per field', async () => {
    const { env, store } = await setup();
    store.put.mockClear();
    const response = await call(env, 'PUT', '/api/admin/config', {
      revision: 1,
      projects: [{ ...projects[0], tier: 'urgent' }, projects[1]],
    });
    expect(response.status).toBe(422);
    const body = (await response.json()) as {
      errors: { path: string }[];
    };
    expect(body.errors.map((e) => e.path)).toContain('projects.0.tier');
    expect(store.put).not.toHaveBeenCalled();
  });

  it('rejects changing the slug of an existing project', async () => {
    const { env, store } = await setup();
    store.put.mockClear();
    const response = await call(env, 'PUT', '/api/admin/config', {
      revision: 1,
      projects: [{ ...projects[0], slug: 'renamed' }, ...projects.slice(1)],
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      errors: [{ path: 'projects.0.slug' }],
    });
    expect(store.put).not.toHaveBeenCalled();
  });

  it('rejects adding or publishing a private repository', async () => {
    const { env, store } = await setup();
    store.put.mockClear();
    const fetcher = github({
      [`${OWNER}/new-repo`]: { private: true },
      [projects[0]?.repository ?? '']: { private: true },
    }) as unknown as typeof fetch;
    const added = await call(
      env,
      'PUT',
      '/api/admin/config',
      { revision: 1, projects: [...projects, newProject] },
      { Origin: ORIGIN },
      fetcher,
    );
    expect(added.status).toBe(422);
    expect(await added.json()).toMatchObject({
      errors: [
        {
          path: `projects.${projects.length}.repository`,
          message: 'repository is not public',
        },
      ],
    });
    // Publishing a currently unpublished entry also re-checks visibility.
    await writeProjectConfig(store, {
      projects: [{ ...projects[0], published: false }, ...projects.slice(1)],
      expectedRevision: 1,
      updatedBy: 'seed',
    });
    const published = await call(
      env,
      'PUT',
      '/api/admin/config',
      { revision: 2, projects },
      { Origin: ORIGIN },
      fetcher,
    );
    expect(published.status).toBe(422);
    expect((await readProjectConfig(store)).revision).toBe(2);
  });

  it('rejects new repositories outside the fixed owner', async () => {
    const { env } = await setup();
    const response = await call(env, 'PUT', '/api/admin/config', {
      revision: 1,
      projects: [
        ...projects,
        { ...newProject, repository: 'someone-else/new-repo' },
      ],
    });
    expect(response.status).toBe(422);
  });

  it('rejects mutating requests with a missing or foreign Origin', async () => {
    const { env, store } = await setup();
    store.put.mockClear();
    const body = { revision: 1, projects };
    for (const headers of [{}, { Origin: 'https://evil.example' }] as Record<
      string,
      string
    >[]) {
      const response = await call(
        env,
        'PUT',
        '/api/admin/config',
        body,
        headers,
      );
      expect(response.status).toBe(403);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(store.put).not.toHaveBeenCalled();
  });

  it('allows only the documented methods', async () => {
    const { env } = await setup();
    expect((await call(env, 'POST', '/api/admin/config', {})).status).toBe(405);
    expect((await call(env, 'DELETE', '/api/admin/candidates')).status).toBe(
      405,
    );
    expect((await call(env, 'PATCH', '/api/admin/config', {}, {})).status).toBe(
      405,
    );
    expect((await call(env, 'GET', '/api/admin/unknown')).status).toBe(404);
  });

  it('lists only unregistered public repositories of the fixed owner', async () => {
    const { env } = await setup();
    const registered = projects[0]?.repository ?? '';
    const fetcher = github({
      [registered]: { private: false },
      [`${OWNER}/fresh`]: { private: false },
      [`${OWNER}/secret`]: { private: true },
    });
    const response = await call(
      env,
      'GET',
      '/api/admin/candidates',
      undefined,
      {},
      fetcher as unknown as typeof fetch,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      candidates: { repository: string; defaults: unknown }[];
    };
    expect(body.candidates.map((c) => c.repository)).toEqual([
      `${OWNER}/fresh`,
    ]);
    expect(body.candidates[0]?.defaults).toMatchObject({
      published: false,
      tier: 'low',
    });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe(`/users/${OWNER}/repos`);
  });

  it('rejects unauthorized requests on every endpoint', async () => {
    const { env } = await setup();
    const strict: AdminApiEnv = {
      ...env,
      ADMIN_AUTH_BYPASS: undefined,
      ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      ACCESS_AUD: 'aud',
      ADMIN_ALLOWED_EMAILS: 'me@example.com',
    };
    const fetcher = github({});
    for (const [method, path] of [
      ['GET', '/api/admin/config'],
      ['PUT', '/api/admin/config'],
      ['GET', '/api/admin/candidates'],
      ['GET', '/API/Admin/Config'],
    ] as const) {
      const response = await call(
        strict,
        method,
        path,
        method === 'PUT' ? { revision: 1, projects } : undefined,
        { Origin: ORIGIN },
        fetcher as unknown as typeof fetch,
      );
      expect(response.status).toBe(401);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('is wired into the worker entrypoint behind the gate', async () => {
    const { env } = await setup();
    const open = await worker.fetch(
      new Request(`${ORIGIN}/api/admin/config`),
      env as never,
    );
    expect(open.status).toBe(200);
    const denied = await worker.fetch(
      new Request('https://example.com/api/admin/config'),
      { ...env, ADMIN_AUTH_BYPASS: undefined } as never,
    );
    expect(denied.status).toBe(503);
  });
});
