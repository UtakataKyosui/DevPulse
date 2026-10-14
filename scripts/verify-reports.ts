import { readFileSync } from 'node:fs';
import { verifyPublishedFeed } from './lib/verify-reports.ts';

const origin = process.env.DEVPULSE_SITE_URL;
if (!origin) throw new Error('Missing site origin');
const expected = readFileSync('apps/web/doc_build/rss/reports.xml', 'utf8');
await verifyPublishedFeed(origin, expected);
