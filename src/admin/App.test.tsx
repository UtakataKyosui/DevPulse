// @vitest-environment happy-dom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import projectsJson from '../data/devpulse/projects.sample.json';
import { type AdminApiEnv, handleAdminApi } from '../worker/admin-api.ts';
import {
  CONFIG_HISTORY_KEY,
  readProjectConfig,
  writeProjectConfig,
} from '../worker/config-store.ts';
import { App } from './App.tsx';

const ORIGIN = 'http://localhost:8787';
// 管理 API は管理者のオーナー配下のリポジトリだけを新規追加できるため、fixture を寄せる。
const OWNER = 'UtakataKyosui';
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

/** 誤操作(先頭を非公開、2 件目を削除)を revision 2 として保存した状態。 */
async function afterMistake() {
  const store = kv();
  const seeded = await writeProjectConfig(store, {
    projects,
    expectedRevision: null,
    updatedBy: 'seed',
  });
  const [first, , ...rest] = projects;
  await writeProjectConfig(store, {
    projects: [{ ...first, published: false }, ...rest],
    expectedRevision: 1,
    updatedBy: 'admin@example.com',
  });
  const env: AdminApiEnv = {
    CONFIG: store,
    ADMIN_SETTINGS: { githubOwner: OWNER },
    ADMIN_AUTH_BYPASS: '1',
  };
  return { store, env, seeded };
}

/** 全リポジトリを public と答える GitHub。 */
const github = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  if (url.pathname.startsWith('/users/')) return Response.json([]);
  return Response.json({
    full_name: url.pathname.replace('/repos/', ''),
    private: false,
    visibility: 'public',
  });
}) as typeof fetch;

/** 管理画面を描画する。fetch は実際の管理 API(ブラウザ同様に Origin 付き)へ渡す。 */
async function openAdmin(env: AdminApiEnv) {
  vi.stubGlobal('fetch', async (path: string, init: RequestInit = {}) => {
    if (!path.startsWith('/api/admin/'))
      return Response.json({ error: 'unavailable' }, { status: 503 });
    const request = new Request(`${ORIGIN}${path}`, {
      method: init.method,
      headers: init.headers,
      body: init.body,
    });
    // happy-dom の Request は Origin を禁止ヘッダとして捨てるため、ブラウザ同様の送信元をここで付ける。
    const mutating = Boolean(init.method && init.method !== 'GET');
    const withOrigin = new Proxy(request, {
      get(target, key) {
        if (key === 'headers')
          return {
            get: (name: string) =>
              mutating && name.toLowerCase() === 'origin'
                ? ORIGIN
                : target.headers.get(name),
          };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return handleAdminApi(withOrigin, env, github);
  });
  vi.stubGlobal('confirm', () => true);
  window.confirm = () => true;
  render(<App />);
  await screen.findByText(/revision 2 \//);
  return userEvent.setup();
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('admin UI', () => {
  it('links back to the site', async () => {
    const { env } = await afterMistake();
    await openAdmin(env);
    expect(
      screen.getByRole('link', { name: /サイトへ戻る/ }).getAttribute('href'),
    ).toBe('/');
  });

  it('saves an edited name after confirming the diff', async () => {
    const { store, env } = await afterMistake();
    const user = await openAdmin(env);
    const save = screen.getByRole('button', { name: /変更を保存/ });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    const [first] = screen.getAllByLabelText('名前');
    if (!first) throw new Error('no name field');
    await user.clear(first);
    await user.type(first, 'Renamed');
    expect((save as HTMLButtonElement).disabled).toBe(false);

    await user.click(save);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('変更:');
    expect(dialog.textContent).toContain('"Renamed"');
    await user.click(
      within(dialog).getByRole('button', { name: 'この内容で保存' }),
    );

    await waitFor(async () =>
      expect((await readProjectConfig(store)).revision).toBe(3),
    );
    expect((await readProjectConfig(store)).projects[0]?.name).toBe('Renamed');
    await screen.findByText(/revision 3\)。/);
  });

  it('restores the previous revision with only UI operations', async () => {
    const { store, env, seeded } = await afterMistake();
    const user = await openAdmin(env);

    const restoreButtons = await screen.findAllByRole('button', {
      name: /差分を確認して復元/,
    });
    const target = restoreButtons.find(
      (b) => b.getAttribute('data-revision') === '1',
    );
    if (!target) throw new Error('no restore button for revision 1');
    await user.click(target);

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('追加: Sample Empty');
    expect(dialog.textContent).toContain(
      '変更: DevPulse / 公開: false -> true',
    );
    const confirm = within(dialog).getByRole('button', {
      name: 'この内容で復元',
    });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);

    await user.click(confirm);
    await waitFor(async () =>
      expect((await readProjectConfig(store)).revision).toBe(3),
    );
    expect((await readProjectConfig(store)).projects).toEqual(seeded.projects);
    await screen.findByText(/revision 3 として復元/);
    expect(screen.queryByRole('dialog')).toBeNull();
    // The mistaken revision is kept too, so the restore itself can be undone.
    expect(
      (
        await screen.findAllByRole('button', { name: /差分を確認して復元/ })
      ).some((b) => b.getAttribute('data-revision') === '2'),
    ).toBe(true);
  });

  it('shows validation errors and blocks restoring an invalid revision', async () => {
    const { store, env } = await afterMistake();
    const history = JSON.parse(store.values.get(CONFIG_HISTORY_KEY) ?? '[]');
    history[0].projects[0].tier = 'urgent';
    store.values.set(CONFIG_HISTORY_KEY, JSON.stringify(history));
    const user = await openAdmin(env);

    const target = (
      await screen.findAllByRole('button', { name: /差分を確認して復元/ })
    ).find((b) => b.getAttribute('data-revision') === '1');
    if (!target) throw new Error('no restore button for revision 1');
    await user.click(target);

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('projects.0.tier');
    expect(
      (
        within(dialog).getByRole('button', {
          name: 'この内容で復元',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
