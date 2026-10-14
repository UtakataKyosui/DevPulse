import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  fetchPublishedProjects,
  PROJECTS_CACHE,
} from '../src/lib/devpulse/build-config.ts';

// 公開 API(GET /api/projects)だけを使うので認証は不要。
const origin = new URL(process.env.DEVPULSE_SITE_URL ?? '');
if (origin.protocol !== 'https:' && origin.hostname !== 'localhost')
  throw new Error('Use HTTPS to fetch project config');
if (
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash
)
  throw new Error('Use a site origin');

// 失敗時に前回の取得結果でビルドが通らないよう、先に消す。
rmSync(PROJECTS_CACHE, { force: true });
const projects = await fetchPublishedProjects(origin);
mkdirSync(path.dirname(PROJECTS_CACHE), { recursive: true });
writeFileSync(PROJECTS_CACHE, `${JSON.stringify({ projects }, null, 2)}\n`);
console.log(`Fetched ${projects.length} published projects`);
