import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { reportDateSchema, reportSchema } from '@devpulse/domain/reports/model';
import { z } from 'zod';

const origin = new URL(process.env.DEVPULSE_SITE_URL ?? '');
if (origin.protocol !== 'https:' && origin.hostname !== 'localhost')
  throw new Error('Use HTTPS for report publication');
if (
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash
)
  throw new Error('Use a site origin');
const token = process.env.REPORTS_TOKEN;
if (!token || token.length < 32)
  throw new Error('REPORTS_TOKEN must contain at least 32 characters');

async function api(path: string, body?: unknown): Promise<Response> {
  const response = await fetch(new URL(path, origin), {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new Error(`Report API returned HTTP ${response.status}`);
  return response;
}

const cache = '.reports-cache/reports.json';
const mode = process.argv[2] ?? 'fetch';
if (mode === 'fetch') {
  const reports: z.infer<typeof reportSchema>[] = [];
  let after = '';
  for (let page = 0; page < 100; page++) {
    const response = await api(`/api/reports${after ? `?after=${after}` : ''}`);
    const batch = z
      .object({
        reports: z.array(reportSchema).max(100),
        nextCursor: reportDateSchema.nullable(),
      })
      .parse(await response.json());
    reports.push(...batch.reports);
    if (!batch.nextCursor) {
      mkdirSync('.reports-cache', { recursive: true });
      writeFileSync(cache, `${JSON.stringify(reports, null, 2)}\n`);
      console.log(`Fetched ${reports.length} reports`);
      break;
    }
    if (batch.nextCursor <= after)
      throw new Error('Report cursor did not advance');
    after = batch.nextCursor;
    if (page === 99) throw new Error('Report export limit exceeded');
  }
} else if (mode === 'ack') {
  const reports = z
    .array(reportSchema)
    .parse(JSON.parse(readFileSync(cache, 'utf8')));
  for (let offset = 0; offset < reports.length; offset += 100) {
    await api('/api/reports/published', {
      dates: reports
        .slice(offset, offset + 100)
        .map((report) => report.input.date),
    });
  }
  console.log('Report publication acknowledged');
} else if (mode === 'generate') {
  await api('/api/reports/generate?retry=1', {});
  console.log('Daily generation requested');
} else {
  throw new Error('Use fetch, ack or generate');
}
