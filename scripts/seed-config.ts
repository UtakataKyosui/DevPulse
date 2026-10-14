import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CONFIG_KEY, writeProjectConfig } from '../src/worker/config-store.ts';

// Usage: pnpm run config:seed                               (local `cf dev` KV)
//        pnpm run config:seed -- --remote --namespace-id ID (production)
const { values } = parseArgs({
  options: {
    remote: { type: 'boolean', default: false },
    'namespace-id': { type: 'string' },
    source: { type: 'string', default: 'src/data/devpulse/projects.json' },
  },
});
// cf dev のローカル KV は binding 名を namespace id として扱う。
const namespaceId = values['namespace-id'] ?? 'CONFIG';
if (values.remote && !values['namespace-id'])
  throw new Error(
    '--remote requires --namespace-id (see Cloudflare dashboard)',
  );

function wrangler(args: string[]): string {
  return execFileSync(
    'pnpm',
    [
      'exec',
      'wrangler',
      'kv',
      'key',
      ...args,
      '--namespace-id',
      namespaceId,
      values.remote ? '--remote' : '--local',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
}

// writeProjectConfig と同じ読み書きを wrangler 経由で行う。
const kv = {
  async get(key: string) {
    const keys: { name: string }[] = JSON.parse(
      wrangler(['list', '--prefix', key]),
    );
    if (!keys.some((k) => k.name === key)) return null;
    return wrangler(['get', key, '--text']);
  },
  async put(key: string, value: string) {
    const dir = mkdtempSync(join(tmpdir(), 'devpulse-seed-'));
    try {
      const file = join(dir, 'value.json');
      writeFileSync(file, value);
      wrangler(['put', key, '--path', file]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  },
};

const source = JSON.parse(readFileSync(values.source, 'utf8'));
// 既に値があれば revision 競合で失敗する(上書きしない)。
const seeded = await writeProjectConfig(kv, {
  projects: source.projects,
  expectedRevision: null,
  updatedBy: 'seed',
});
console.log(
  `Seeded ${CONFIG_KEY} revision ${seeded.revision} (${seeded.projects.length} projects) to ${values.remote ? 'remote' : 'local'} namespace ${namespaceId}`,
);
