import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../setup-secrets.ts', import.meta.url));
const fakeCli = `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { basename } = require('node:path');
const cli = basename(process.argv[1]);
const args = process.argv.slice(2);
const action = args.includes('list') ? 'list' : 'set';
if (action === 'list') {
  appendFileSync(process.env.TEST_LOG, cli + ':list\\n');
  if (process.env.FAIL_PREFLIGHT === cli) process.exit(1);
  process.stdout.write('[]');
} else {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    const hash = createHash('sha256').update(input).digest('hex');
    appendFileSync(process.env.TEST_LOG, cli + ':set:' + input.length + ':' + hash + '\\n');
  });
}
`;

function run(failPreflight?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'devpulse-secrets-test-'));
  try {
    for (const cli of ['pnpm', 'gh']) {
      const path = join(dir, cli);
      writeFileSync(path, fakeCli);
      chmodSync(path, 0o755);
    }
    const log = join(dir, 'commands.log');
    const result = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH ?? ''}`,
        TEST_LOG: log,
        FAIL_PREFLIGHT: failPreflight ?? '',
      },
    });
    return {
      ...result,
      commands: readFileSync(log, 'utf8').trim().split('\n'),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('setup:secrets', () => {
  it('does not replace either secret if a destination cannot be read', () => {
    const result = run('gh');
    expect(result.status).not.toBe(0);
    expect(result.commands).toEqual(['pnpm:list', 'gh:list']);
    expect(result.stderr).toContain('no secrets were changed');
  });

  it('sends the same generated token through stdin to both destinations', () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.commands.slice(0, 2)).toEqual(['pnpm:list', 'gh:list']);
    const writes = result.commands.slice(2);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatch(/^pnpm:set:43:[a-f0-9]{64}$/);
    expect(writes[1]?.replace('gh:set:', 'pnpm:set:')).toBe(writes[0]);
    expect(result.stdout).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });
});
