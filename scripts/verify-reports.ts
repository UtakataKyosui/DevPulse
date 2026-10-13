import { readFileSync } from 'node:fs';

const origin = process.env.DEVPULSE_SITE_URL;
if (!origin) throw new Error('Missing site origin');
const expected = readFileSync('doc_build/rss/reports.xml', 'utf8');
const response = await fetch(new URL('/rss/reports.xml', origin), {
  redirect: 'error',
  signal: AbortSignal.timeout(30000),
});
if (!response.ok || (await response.text()) !== expected)
  throw new Error('Published feed does not match build');
console.log('Published RSS matches build');
