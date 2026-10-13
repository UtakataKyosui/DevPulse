import projectsJson from '../data/devpulse/projects.json';
import {
  projectConfigSchema,
  snapshotFileSchema,
} from '../lib/devpulse/schema.ts';
import { type Env, SNAPSHOT_KEY, syncSnapshots } from './sync.ts';

const projects = projectConfigSchema
  .parse(projectsJson)
  .projects.filter((p) => p.published);
const MAX_AGE = 48 * 60 * 60 * 1000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/api/snapshots') {
      if (request.method !== 'GET')
        return new Response('Method not allowed', {
          status: 405,
          headers: { Allow: 'GET' },
        });
      const stored = await env.SNAPSHOTS.get(SNAPSHOT_KEY, 'json');
      if (!stored)
        return Response.json(
          { error: 'Snapshots not synchronized yet' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
      const data = snapshotFileSchema.parse(stored);
      return Response.json(
        {
          snapshots: data.snapshots.filter(
            (s) =>
              projects.some((p) => p.repository === s.repository) &&
              s.visibility === 'public' &&
              Date.now() - Date.parse(s.fetchedAt) < MAX_AGE,
          ),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (path.startsWith('/api/'))
      return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await syncSnapshots(env);
  },
};
