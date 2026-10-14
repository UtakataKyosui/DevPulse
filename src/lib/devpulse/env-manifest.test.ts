import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENV_MANIFEST, evaluateEnv } from './env-manifest.ts';

describe('evaluateEnv', () => {
  it('classifies each item by presence, requirement and lookup failure', () => {
    const result = evaluateEnv({
      'github-variable': new Set(['DEVPULSE_SITE_URL']),
      'github-secret': new Set(['REPORTS_TOKEN']),
      'worker-secret': null,
    });
    const status = (place: string, name: string) =>
      result.find((r) => r.item.place === place && r.item.name === name)
        ?.status;
    expect(status('github-variable', 'DEVPULSE_SITE_URL')).toBe('ok');
    expect(status('github-secret', 'REPORTS_TOKEN')).toBe('ok');
    expect(status('github-secret', 'CLOUDFLARE_API_TOKEN')).toBe('missing');
    expect(status('worker-secret', 'REPORTS_TOKEN')).toBe('unknown');
  });

  it('marks a missing optional item without failing', () => {
    const result = evaluateEnv({ 'worker-secret': new Set() });
    expect(result.find((r) => r.item.name === 'GITHUB_TOKEN')?.status).toBe(
      'optional-missing',
    );
  });
});

describe('ENV_MANIFEST', () => {
  it('is listed in the setup checklist', () => {
    const checklist = readFileSync(
      '.agents/skills/devpulse-development/references/setup-checklist.md',
      'utf8',
    );
    for (const item of ENV_MANIFEST)
      expect(checklist, item.name).toContain(`\`${item.name}\``);
  });
});
