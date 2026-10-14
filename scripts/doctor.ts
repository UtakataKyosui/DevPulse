import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import {
  type EnvPlace,
  evaluateEnv,
} from '../src/lib/devpulse/env-manifest.ts';

// Usage: pnpm run doctor [--worker devpulse]
// 読み取り専用。名前の有無だけを確認し、値は取得しない。
const { values } = parseArgs({
  options: { worker: { type: 'string', default: 'devpulse' } },
});

function names(command: string, args: string[]): Set<string> | null {
  try {
    const output = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const entries: { name: string }[] = JSON.parse(output);
    return new Set(entries.map((entry) => entry.name));
  } catch {
    return null;
  }
}

const present: Partial<Record<EnvPlace, Set<string> | null>> = {
  'github-variable': names('gh', ['variable', 'list', '--json', 'name']),
  'github-secret': names('gh', ['secret', 'list', '--json', 'name']),
  'worker-secret': names('pnpm', [
    'exec',
    'wrangler',
    'secret',
    'list',
    '--name',
    values.worker,
  ]),
};

const labels = {
  ok: 'OK',
  missing: 'MISSING',
  'optional-missing': 'optional',
  unknown: 'UNKNOWN',
} as const;
const results = evaluateEnv(present);
for (const { item, status } of results)
  console.log(`${labels[status].padEnd(8)} ${item.place}  ${item.name}`);

if (results.some((r) => r.status === 'unknown'))
  console.log(
    'UNKNOWN: 取得できませんでした。gh auth login と Wrangler の認証を確認してください。',
  );
if (results.some((r) => r.status === 'missing')) process.exitCode = 1;
