import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { renderReport, reportSchema } from '@devpulse/domain/reports/model';
import { z } from 'zod';

export function loadReports(root: string): z.infer<typeof reportSchema>[] {
  const cache = path.join(root, '.reports-cache/reports.json');
  let reports: z.infer<typeof reportSchema>[] = [];
  try {
    reports = z
      .array(reportSchema)
      .max(10000)
      .parse(JSON.parse(readFileSync(cache, 'utf8')));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
  reports.sort((a, b) => b.input.date.localeCompare(a.input.date));
  const dates = reports.map((report) => report.input.date);
  if (new Set(dates).size !== dates.length)
    throw new Error('Duplicate report dates');
  return reports;
}

export function prepareReports(
  root: string,
  reports = loadReports(root),
): string[] {
  const dates = reports.map((report) => report.input.date);
  if (dates.length && !process.env.DEVPULSE_SITE_URL)
    throw new Error('DEVPULSE_SITE_URL is required for report publication');
  const directory = path.join(root, 'docs/reports');
  mkdirSync(directory, { recursive: true });
  // Only date directories owned by this generator are replaced.
  for (const entry of readdirSync(directory)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(entry))
      rmSync(path.join(directory, entry), { recursive: true });
  }
  for (const report of reports) {
    const destination = path.join(directory, report.input.date);
    mkdirSync(destination, { recursive: true });
    writeFileSync(path.join(destination, 'index.md'), renderReport(report));
  }
  writeFileSync(
    path.join(root, 'docs/public/reports-manifest.json'),
    `${JSON.stringify(dates.slice(0, 30))}\n`,
  );
  return dates;
}
