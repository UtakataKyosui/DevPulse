import { DatabaseSync } from 'node:sqlite';
import projectsJson from '@devpulse/domain/fixtures/projects.sample.json';
import { CONFIG_KEY, type ConfigKv } from './config-store.ts';
import type { Env } from './sync.ts';

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

/** テスト用の D1。node:sqlite の in-memory DB で実際の SQL を実行する。 */
export function database() {
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
