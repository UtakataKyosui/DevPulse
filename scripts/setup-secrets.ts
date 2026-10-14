import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';

// Usage: pnpm run setup:secrets                  (generate and register REPORTS_TOKEN)
//        pnpm run setup:secrets --dry-run     (show the commands only)
// 生成した値は標準入力でだけ渡し、引数・ログ・ファイルには出さない。
const { values } = parseArgs({
  options: {
    worker: { type: 'string', default: 'devpulse' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const NAME = 'REPORTS_TOKEN';
const targets = [
  {
    label: `Worker "${values.worker}"`,
    command: 'pnpm',
    args: [
      '--filter',
      '@devpulse/worker',
      'exec',
      'wrangler',
      'secret',
      'put',
      NAME,
      '--name',
      values.worker,
    ],
  },
  {
    label: 'GitHub Actions',
    command: 'gh',
    args: ['secret', 'set', NAME],
  },
];

// Check both destinations before replacing either secret. This does not make
// the two writes atomic, but catches missing credentials and a missing Worker.
const checks = [
  {
    label: `Worker "${values.worker}"`,
    command: 'pnpm',
    args: [
      '--filter',
      '@devpulse/worker',
      'exec',
      'wrangler',
      'secret',
      'list',
      '--name',
      values.worker,
    ],
  },
  {
    label: 'GitHub Actions',
    command: 'gh',
    args: ['secret', 'list', '--json', 'name'],
  },
];

if (values['dry-run']) {
  for (const check of checks)
    console.log(`${check.label}: ${check.command} ${check.args.join(' ')}`);
  for (const t of targets)
    console.log(
      `${t.label}: ${t.command} ${t.args.join(' ')} (value via stdin)`,
    );
  process.exit(0);
}

for (const check of checks) {
  try {
    execFileSync(check.command, check.args, {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  } catch {
    throw new Error(`Cannot access ${check.label}; no secrets were changed.`);
  }
}

// 32文字以上の要件を満たす43文字。再実行すると新しい値で両方を置き換える。
const token = randomBytes(32).toString('base64url');
for (const [index, t] of targets.entries()) {
  let succeeded = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      execFileSync(t.command, t.args, {
        input: token,
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      succeeded = true;
      break;
    } catch {
      if (attempt < 2) console.error(`Retrying ${NAME} for ${t.label}.`);
    }
  }
  if (!succeeded) {
    const done = targets.slice(0, index).map((d) => d.label);
    throw new Error(
      `Failed to set ${NAME} for ${t.label}.${done.length ? ` Already updated: ${done.join(', ')}. The two values may differ until recovery.` : ''} Fix access to ${t.label}, then rerun to replace both with a new value.`,
    );
  }
  console.log(`Set ${NAME} for ${t.label}`);
}
