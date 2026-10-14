import { describe, expect, it, vi } from 'vitest';
import projectsJson from '../data/devpulse/projects.sample.json';
import { type AdminApiEnv, handleAdminApi } from './admin-api.ts';
import {
  CONFIG_HISTORY_KEY,
  HISTORY_LIMIT,
  readProjectConfig,
  writeProjectConfig,
} from './config-store.ts';
import worker from './index.ts';

const ORIGIN = 'http://localhost:8787';
const OWNER = 'UtakataKyosui';
// 管理 API は管理者のオーナー配下のリポジトリだけを新規追加できるため、fixture を寄せる。
const projects = projectsJson.projects.map((p) => ({
  ...p,
  repository: p.repository.replace(/^example\//, `${OWNER}/`),
}));

function kv() {
  const values = new Map<string, string>();
  const get = vi.fn(async (key: string) => values.get(key) ?? null);
  const put = vi.fn(async (key: string, text: string) => {
    values.set(key, text);
  });
  return { get, put, values };
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
    for (const [method, path] of [
      ['PUT', '/api/admin/config'],
      ['POST', '/api/admin/history/1/restore'],
    ])
      for (const headers of [{}, { Origin: 'https://evil.example' }] as Record<
        string,
        string
      >[]) {
        const response = await call(env, method, path, body, headers);
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
    const putHistory = await call(env, 'PUT', '/api/admin/history', {});
    expect(putHistory.status).toBe(405);
    expect(putHistory.headers.get('Allow')).toBe('GET');
    const getRestore = await call(env, 'GET', '/api/admin/history/1/restore');
    expect(getRestore.status).toBe(405);
    expect(getRestore.headers.get('Allow')).toBe('POST');
    expect(
      (await call(env, 'DELETE', '/api/admin/history/1')).headers.get('Allow'),
    ).toBe('GET');
    expect((await call(env, 'GET', '/api/admin/history/abc')).status).toBe(404);
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
      ACCESS_SETTINGS: { teamDomain: 'team.cloudflareaccess.com', aud: 'aud' },
      ADMIN_ALLOWED_EMAILS: 'me@example.com',
    };
    const fetcher = github({});
    for (const [method, path] of [
      ['GET', '/api/admin/config'],
      ['PUT', '/api/admin/config'],
      ['GET', '/api/admin/candidates'],
      ['GET', '/api/admin/history'],
      ['GET', '/api/admin/history/1'],
      ['POST', '/api/admin/history/1/restore'],
      ['GET', '/API/Admin/Config'],
    ] as const) {
      const response = await call(
        strict,
        method,
        path,
        method === 'GET' ? undefined : { revision: 1, projects },
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

describe('admin config history', () => {
  const allPublic = () =>
    github(
      Object.fromEntries(
        projects.map((p) => [p.repository, { private: false }]),
      ),
    ) as unknown as typeof fetch;

  /** 誤操作: 先頭を非公開にし、2 件目を削除して revision 2 を保存する。 */
  async function mistake(env: AdminApiEnv) {
    const [first, , ...rest] = projects;
    const response = await call(env, 'PUT', '/api/admin/config', {
      revision: 1,
      projects: [{ ...first, published: false }, ...rest],
    });
    expect(response.status).toBe(200);
  }

  it('rolls back an accidental change through the API only', async () => {
    const { env, store } = await setup();
    const seeded = await readProjectConfig(store);
    await mistake(env);

    const list = await call(env, 'GET', '/api/admin/history');
    expect(list.status).toBe(200);
    expect(list.headers.get('Cache-Control')).toBe('no-store');
    expect(await list.json()).toEqual({
      revision: 2,
      limit: HISTORY_LIMIT,
      entries: [
        {
          revision: 1,
          updatedAt: seeded.updatedAt,
          updatedBy: 'seed',
          projectCount: projects.length,
        },
      ],
    });

    const entry = await call(env, 'GET', '/api/admin/history/1');
    expect(entry.headers.get('Cache-Control')).toBe('no-store');
    expect(await entry.json()).toEqual({ ...seeded, errors: [] });

    // The re-added and re-published projects are re-checked on GitHub.
    const restored = await call(
      env,
      'POST',
      '/api/admin/history/1/restore',
      { revision: 2 },
      { Origin: ORIGIN },
      allPublic(),
    );
    expect(restored.status).toBe(200);
    expect(restored.headers.get('Cache-Control')).toBe('no-store');
    expect(await readProjectConfig(store)).toMatchObject({
      revision: 3,
      updatedBy: 'local-bypass',
      projects: seeded.projects,
    });
    const after = (await (
      await call(env, 'GET', '/api/admin/history')
    ).json()) as { entries: { revision: number }[] };
    expect(after.entries.map((e) => e.revision)).toEqual([2, 1]);
  });

  it('returns 409 for a restore against a stale revision without writing', async () => {
    const { env, store } = await setup();
    await mistake(env);
    store.put.mockClear();
    const response = await call(
      env,
      'POST',
      '/api/admin/history/1/restore',
      { revision: 1 },
      { Origin: ORIGIN },
      allPublic(),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ revision: 2 });
    expect(store.put).not.toHaveBeenCalled();
  });

  it('rejects restoring an entry that fails projectConfigSchema', async () => {
    const { env, store } = await setup();
    await mistake(env);
    // Simulate an entry saved under an older schema.
    const history = JSON.parse(store.values.get(CONFIG_HISTORY_KEY) ?? '[]');
    history[0].projects[0].tier = 'urgent';
    store.values.set(CONFIG_HISTORY_KEY, JSON.stringify(history));
    store.put.mockClear();

    const entry = (await (
      await call(env, 'GET', '/api/admin/history/1')
    ).json()) as { errors: { path: string }[] };
    expect(entry.errors.map((e) => e.path)).toContain('projects.0.tier');

    const response = await call(
      env,
      'POST',
      '/api/admin/history/1/restore',
      { revision: 2 },
      { Origin: ORIGIN },
      allPublic(),
    );
    expect(response.status).toBe(422);
    const body = (await response.json()) as { errors: { path: string }[] };
    expect(body.errors.map((e) => e.path)).toContain('projects.0.tier');
    expect(store.put).not.toHaveBeenCalled();
  });

  it('applies the same publicity check as PUT when restoring', async () => {
    const { env, store } = await setup();
    await mistake(env);
    store.put.mockClear();
    const response = await call(
      env,
      'POST',
      '/api/admin/history/1/restore',
      { revision: 2 },
      { Origin: ORIGIN },
      github({}) as unknown as typeof fetch,
    );
    expect(response.status).toBe(422);
    expect(store.put).not.toHaveBeenCalled();
  });

  it(`keeps only the latest ${HISTORY_LIMIT} revisions and 404s for older ones`, async () => {
    const { env, store } = await setup();
    for (let revision = 1; revision <= HISTORY_LIMIT + 1; revision++)
      await writeProjectConfig(store, {
        projects,
        expectedRevision: revision,
        updatedBy: 'admin',
      });
    const list = (await (
      await call(env, 'GET', '/api/admin/history')
    ).json()) as { revision: number; entries: { revision: number }[] };
    expect(list.revision).toBe(HISTORY_LIMIT + 2);
    expect(list.entries).toHaveLength(HISTORY_LIMIT);
    expect(list.entries.at(-1)?.revision).toBe(2);
    expect((await call(env, 'GET', '/api/admin/history/1')).status).toBe(404);
    store.put.mockClear();
    const restore = await call(env, 'POST', '/api/admin/history/1/restore', {
      revision: HISTORY_LIMIT + 2,
    });
    expect(restore.status).toBe(404);
    expect(store.put).not.toHaveBeenCalled();
  });

  it('validates the restore body', async () => {
    const { env, store } = await setup();
    await mistake(env);
    store.put.mockClear();
    const response = await call(env, 'POST', '/api/admin/history/1/restore', {
      projects,
    });
    expect(response.status).toBe(422);
    expect(store.put).not.toHaveBeenCalled();
  });

  it('returns 503 when the history is corrupt', async () => {
    const { env, store } = await setup();
    store.values.set(CONFIG_HISTORY_KEY, '{oops');
    expect((await call(env, 'GET', '/api/admin/history')).status).toBe(503);
  });
});
