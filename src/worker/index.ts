import { z } from 'zod';
import { snapshotFileSchema } from '../lib/devpulse/schema.ts';
import { previousReportDate, reportDateSchema } from '../lib/reports/model.ts';
import { adminGate, isAdminPath } from './admin-auth.ts';
import {
  ConfigInvalidError,
  ConfigMissingError,
  readPublishedProjects,
} from './config-store.ts';
import { ReportStore } from './report-store.ts';
import {
  canPublish,
  DAILY_REPORT_CRON,
  generateDailyReport,
  reportsAuthorized,
  safeRepositories,
} from './reports.ts';
import { type Env, SNAPSHOT_KEY, syncSnapshots } from './sync.ts';

const MAX_AGE = 48 * 60 * 60 * 1000;

/** 設定が読めないときは公開せず 503 にする(詳細は返さずログにのみ残す)。 */
async function configResponse(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (
      !(
        error instanceof ConfigMissingError ||
        error instanceof ConfigInvalidError
      )
    )
      throw error;
    console.error(
      JSON.stringify({ event: 'config_unavailable', error: error.message }),
    );
    return Response.json(
      { error: 'Project configuration unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export default {
  async fetch(
    request: Request,
    env: Env & DevPulseLocalEnv,
  ): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (isAdminPath(path)) {
      const denied = await adminGate(request, env);
      if (denied) return denied;
      // Real admin endpoints are implemented by follow-up tasks.
      return new Response('Not found', {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    if (path.startsWith('/api/reports')) {
      if (!(await reportsAuthorized(request, env.REPORTS_TOKEN)))
        return new Response('Unauthorized', { status: 401 });
      const store = new ReportStore(env.REPORTS);
      await store.initialize();
      if (path === '/api/reports' && request.method === 'GET') {
        const after = new URL(request.url).searchParams.get('after') ?? '';
        if (after && !reportDateSchema.safeParse(after).success)
          return new Response('Invalid cursor', { status: 400 });
        const reports = await store.list(after);
        const repositories = await safeRepositories(env);
        return Response.json(
          {
            reports: reports.filter((report) =>
              canPublish(report, repositories),
            ),
            nextCursor:
              reports.length === 100 ? reports.at(-1)?.input.date : null,
          },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      if (path === '/api/reports/published' && request.method === 'POST') {
        if (Number(request.headers.get('Content-Length') ?? 0) > 4096)
          return new Response('Too large', { status: 413 });
        const raw = await request.text();
        if (raw.length > 4096)
          return new Response('Too large', { status: 413 });
        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch {
          return new Response('Invalid JSON', { status: 400 });
        }
        const body = z
          .object({ dates: z.array(reportDateSchema).max(100) })
          .safeParse(json);
        if (!body.success)
          return new Response('Invalid dates', { status: 400 });
        await store.acknowledge(body.data.dates, new Date().toISOString());
        return new Response(null, { status: 204 });
      }
      if (path === '/api/reports/generate' && request.method === 'POST') {
        // Retry only the current target day; never generate historical claims from current data.
        if (new URL(request.url).searchParams.get('retry') === '1')
          await store.resetAttempts(previousReportDate(new Date()), Date.now());
        const status = await generateDailyReport(env);
        return Response.json(
          { date: previousReportDate(new Date()), status },
          {
            status: status === 'busy_or_exhausted' ? 409 : 200,
            headers: { 'Cache-Control': 'no-store' },
          },
        );
      }
      return new Response('Not found', { status: 404 });
    }
    if (path === '/api/projects') {
      if (request.method !== 'GET')
        return new Response('Method not allowed', {
          status: 405,
          headers: { Allow: 'GET' },
        });
      return configResponse(async () =>
        Response.json(
          { projects: await readPublishedProjects(env.CONFIG) },
          { headers: { 'Cache-Control': 'no-store' } },
        ),
      );
    }
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
      return configResponse(async () => {
        const projects = await readPublishedProjects(env.CONFIG);
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
      });
    }
    if (path.startsWith('/api/'))
      return new Response('Not found', { status: 404 });
    const reportDate = /^\/reports\/(\d{4}-\d{2}-\d{2})(?:\/|\.html|$)/.exec(
      path,
    )?.[1];
    const overview = [
      '/',
      '/index.html',
      '/reports',
      '/reports/',
      '/reports/index.html',
    ].includes(path);
    if (reportDate || overview || path === '/rss/reports.xml') {
      const store = new ReportStore(env.REPORTS);
      await store.initialize();
      const repositories = await safeRepositories(env);
      if (reportDate) {
        const report = await store.get(reportDate);
        if (!report || !canPublish(report, repositories))
          return new Response('Not found', {
            status: 404,
            headers: { 'Cache-Control': 'no-store' },
          });
      } else {
        // Compare the deployed feed manifest with current permissions before serving old assets.
        const manifestResponse = await env.ASSETS.fetch(
          new Request(new URL('/reports-manifest.json', request.url)),
        );
        if (!manifestResponse.ok)
          return new Response('Feed not ready', {
            status: 503,
            headers: { 'Cache-Control': 'no-store' },
          });
        const dates = z
          .array(reportDateSchema)
          .max(30)
          .parse(await manifestResponse.json());
        for (const date of overview ? dates.slice(0, 1) : dates) {
          const report = await store.get(date);
          if (!report || !canPublish(report, repositories))
            return new Response('Feed awaiting republication', {
              status: 503,
              headers: { 'Cache-Control': 'no-store' },
            });
        }
      }
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set('Cache-Control', 'no-store');
      if (path === '/rss/reports.xml')
        response.headers.set(
          'Content-Type',
          'application/rss+xml; charset=utf-8',
        );
      return response;
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(
    event: { cron: string; scheduledTime: number },
    env: Env,
  ): Promise<void> {
    const now = new Date(event.scheduledTime);
    if (event.cron === DAILY_REPORT_CRON) {
      await syncSnapshots(env, fetch, now);
      await generateDailyReport(env, now, previousReportDate(now), false);
    } else {
      // The daily trigger owns the 21:00 JST refresh to avoid duplicate GitHub requests.
      if (now.getUTCHours() === 12) return;
      await syncSnapshots(env, fetch, now);
      // Retry after 21:00 JST until the target JST day changes, bounded to three attempts.
      if (now.getUTCHours() >= 12 && now.getUTCHours() < 15)
        await generateDailyReport(env, now, previousReportDate(now), false);
    }
  },
};
