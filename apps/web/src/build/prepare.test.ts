import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  collectReportInput,
  type Report,
} from '@devpulse/domain/reports/model';
import { afterEach, expect, it, vi } from 'vitest';
import { prepareReports } from './prepare.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true });
  roots.length = 0;
  vi.unstubAllEnvs();
});

it('rebuilds stable articles from saved data, withdraws omitted dates, and limits the feed to 30', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'devpulse-reports-'));
  roots.push(root);
  mkdirSync(path.join(root, 'docs/public'), { recursive: true });
  mkdirSync(path.join(root, '.reports-cache'));
  vi.stubEnv('DEVPULSE_SITE_URL', 'https://example.com');
  const reports: Report[] = Array.from({ length: 31 }, (_, index) => {
    const date = `2026-10-${String(index + 1).padStart(2, '0')}`;
    return {
      input: collectReportInput(
        date,
        [],
        [],
        null,
        new Date('2026-11-01T00:00:00Z'),
      ),
      summary: '変化なし',
      publishedAt: '2026-11-01T00:00:00.000Z',
      model: 'test',
      promptVersion: 1,
    };
  });
  const cache = path.join(root, '.reports-cache/reports.json');
  writeFileSync(cache, JSON.stringify(reports));
  expect(prepareReports(root)).toHaveLength(31);
  const article = path.join(root, 'docs/reports/2026-10-31/index.md');
  const first = readFileSync(article, 'utf8');
  prepareReports(root);
  expect(readFileSync(article, 'utf8')).toBe(first);
  expect(
    JSON.parse(
      readFileSync(
        path.join(root, 'docs/public/reports-manifest.json'),
        'utf8',
      ),
    ),
  ).toHaveLength(30);
  writeFileSync(cache, '[]');
  prepareReports(root);
  expect(() => readFileSync(article)).toThrow();
});

it('fails closed for corrupt caches instead of publishing an empty replacement feed', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'devpulse-reports-'));
  roots.push(root);
  mkdirSync(path.join(root, '.reports-cache'));
  writeFileSync(path.join(root, '.reports-cache/reports.json'), 'invalid');
  expect(() => prepareReports(root)).toThrow();
});
