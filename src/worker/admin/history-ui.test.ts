import { describe, expect, it, vi } from 'vitest';
import projectsJson from '../../data/devpulse/projects.sample.json';
import { type AdminApiEnv, handleAdminApi } from '../admin-api.ts';
import {
  CONFIG_HISTORY_KEY,
  readProjectConfig,
  writeProjectConfig,
} from '../config-store.ts';
import { CLIENT_SCRIPT } from './client-script.ts';
import { serveAdminPage } from './page.ts';

const ORIGIN = 'http://localhost:8787';
// 管理 API は管理者のオーナー配下のリポジトリだけを新規追加できるため、fixture を寄せる。
const OWNER = 'UtakataKyosui';
const projects = projectsJson.projects.map((p) => ({
  ...p,
  repository: p.repository.replace(/^example\//, `${OWNER}/`),
}));

/** 管理画面スクリプトが使う範囲だけを持つ DOM の代用品。 */
class FakeNode {
  children: FakeNode[] = [];
  attrs: Record<string, string> = {};
  listeners: Record<string, ((event: unknown) => unknown)[]> = {};
  classList = { add() {}, remove() {} };
  className = '';
  value = '';
  checked = false;
  disabled = false;
  selected = false;
  draggable = false;
  open = false;
  private text = '';
  tagName: string;
  constructor(tagName: string) {
    this.tagName = tagName;
  }
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join('');
  }
  set textContent(value: string) {
    this.children = [];
    this.text = String(value);
  }
  appendChild(child: FakeNode) {
    this.children.push(child);
    return child;
  }
  setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  }
  addEventListener(type: string, listener: (event: unknown) => unknown) {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }
  click() {
    for (const listener of this.listeners.click ?? [])
      listener({ target: this, preventDefault() {} });
  }
  find(predicate: (node: FakeNode) => boolean): FakeNode | undefined {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child.find(predicate);
      if (found) return found;
    }
    return undefined;
  }
  focus() {}
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
}

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
    ADMIN_SETTINGS: { githubOwner: 'UtakataKyosui' },
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

/** 管理画面を起動する。fetch は実際の管理 API(ブラウザ同様に Origin 付き)へ渡す。 */
async function openAdmin(env: AdminApiEnv) {
  const html = await serveAdminPage(new Request(`${ORIGIN}/admin`)).text();
  const ids = new Map<string, FakeNode>();
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g))
    ids.set(id ?? '', new FakeNode('element'));
  const document = {
    createElement: (tag: string) => new FakeNode(tag),
    createTextNode: (text: string) => {
      const node = new FakeNode('#text');
      node.textContent = text;
      return node;
    },
    getElementById: (id: string) => {
      const node = ids.get(id);
      if (!node) throw new Error(`#${id} is missing from the admin HTML`);
      return node;
    },
    querySelector: () => null,
  };
  const window = { confirm: () => true, addEventListener() {} };
  const fetch = async (path: string, init: RequestInit = {}) => {
    if (!path.startsWith('/api/admin/'))
      return Response.json({ error: 'unavailable' }, { status: 503 });
    const headers = new Headers(init.headers);
    if (init.method && init.method !== 'GET') headers.set('Origin', ORIGIN);
    return handleAdminApi(
      new Request(`${ORIGIN}${path}`, {
        method: init.method,
        headers,
        body: init.body,
      }),
      env,
      github,
    );
  };
  new Function('document', 'window', 'fetch', CLIENT_SCRIPT)(
    document,
    window,
    fetch,
  );
  const byId = (id: string) => document.getElementById(id);
  await vi.waitFor(() =>
    expect(byId('meta').textContent).toContain('revision 2 /'),
  );
  const restoreButton = (revision: number) => {
    const button = byId('history').find(
      (node) => node.attrs['data-revision'] === String(revision),
    );
    if (!button) throw new Error(`no restore button for ${revision}`);
    return button;
  };
  return { byId, restoreButton };
}

describe('admin UI rollback', () => {
  it('restores the previous revision with only UI operations', async () => {
    const { store, env, seeded } = await afterMistake();
    const { byId, restoreButton } = await openAdmin(env);

    restoreButton(1).click();
    await vi.waitFor(() => expect(byId('restore-dialog').open).toBe(true));
    const diff = byId('restore-diff').textContent;
    expect(diff).toContain('追加: Sample Empty');
    expect(diff).toContain('変更: DevPulse / 公開: false -> true');
    expect(byId('restore-confirm').disabled).toBe(false);

    byId('restore-confirm').click();
    await vi.waitFor(async () =>
      expect((await readProjectConfig(store)).revision).toBe(3),
    );
    expect((await readProjectConfig(store)).projects).toEqual(seeded.projects);
    await vi.waitFor(() =>
      expect(byId('banner').textContent).toContain('revision 3 として復元'),
    );
    expect(byId('restore-dialog').open).toBe(false);
    // The mistaken revision is kept too, so the restore itself can be undone.
    expect(() => restoreButton(2)).not.toThrow();
  });

  it('shows validation errors and blocks restoring an invalid revision', async () => {
    const { store, env } = await afterMistake();
    const history = JSON.parse(store.values.get(CONFIG_HISTORY_KEY) ?? '[]');
    history[0].projects[0].tier = 'urgent';
    store.values.set(CONFIG_HISTORY_KEY, JSON.stringify(history));
    const { byId, restoreButton } = await openAdmin(env);

    restoreButton(1).click();
    await vi.waitFor(() => expect(byId('restore-dialog').open).toBe(true));
    expect(byId('restore-errors').textContent).toContain('projects.0.tier');
    expect(byId('restore-diff').children).toHaveLength(0);
    expect(byId('restore-confirm').disabled).toBe(true);
  });
});
