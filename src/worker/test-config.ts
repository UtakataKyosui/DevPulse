import projectsJson from '../data/devpulse/projects.sample.json';
import { CONFIG_KEY, type ConfigKv } from './config-store.ts';

/** テスト用の CONFIG KV。`projects.sample.json` を初期値とし、`set` で実行中に書き換えられる。 */
export function configKv(projects: unknown[] = projectsJson.projects) {
  let current = projects;
  let revision = 1;
  const kv: ConfigKv & { set(next: unknown[]): void } = {
    async get(key) {
      if (key !== CONFIG_KEY) return null;
      return JSON.stringify({
        revision,
        updatedAt: '2026-10-13T00:00:00.000Z',
        updatedBy: 'test',
        projects: current,
      });
    },
    async put() {},
    set(next) {
      current = next;
      revision++;
    },
  };
  return kv;
}
