import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';
import { defineConfig } from '@rspress/core';
import { pluginRss } from '@rspress/plugin-rss';
import projectsJson from './src/data/devpulse/projects.json';
import snapshotsJson from './src/data/devpulse/snapshots.json';
import {
  projectConfigSchema,
  selectPublicData,
  snapshotFileSchema,
} from './src/lib/devpulse/index.ts';
import { buildProjectSidebar } from './src/lib/devpulse/project-sidebar.ts';
import { feedExcerpt } from './src/lib/reports/feed.ts';
import { loadReports, prepareReports } from './src/lib/reports/prepare.ts';

const reports = loadReports(__dirname);
const reportDates = prepareReports(__dirname, reports);
const feedDates = new Set(reportDates.slice(0, 30));
const reportsByDate = new Map(
  reports.map((report) => [report.input.date, report]),
);
const siteUrl = process.env.DEVPULSE_SITE_URL ?? 'http://localhost:8080';
const origin = new URL(siteUrl);
if (
  !['http:', 'https:'].includes(origin.protocol) ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash
) {
  throw new Error('DEVPULSE_SITE_URL must be an absolute site origin');
}

// ビルド 1 回につき 1 度だけ評価され、SSG とクライアントの双方に同じ値が埋め込まれる(hydration 不整合の防止)
const DEVPULSE_BUILD_TIME = new Date().toISOString();

// 公開フィルタをビルド境界で適用し、非公開データをクライアント成果物へ含めない
const DEVPULSE_PUBLIC_DATA = selectPublicData(
  projectConfigSchema.parse(projectsJson).projects,
  snapshotFileSchema.parse(snapshotsJson).snapshots,
);

// lifecycle を変更したら dev 起動・ビルド時にサイドバーも更新する。
const projectMetaPath = path.join(__dirname, 'docs/projects/_meta.json');
const projectMeta = `${JSON.stringify(buildProjectSidebar(DEVPULSE_PUBLIC_DATA.projects), null, 2)}\n`;
if (readFileSync(projectMetaPath, 'utf8') !== projectMeta) {
  writeFileSync(projectMetaPath, projectMeta);
}

// 公開対象にない slug(非公開・設定から削除済み)の手書き MDX をビルド対象から除外する。
const publicSlugs = new Set(DEVPULSE_PUBLIC_DATA.projects.map((p) => p.slug));
const excludedProjectPages = readdirSync(
  path.join(__dirname, 'docs/projects'),
  { withFileTypes: true },
)
  .filter((entry) => entry.isDirectory() && !publicSlugs.has(entry.name))
  .map((entry) => `projects/${entry.name}/**`);

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  globalStyles: path.join(__dirname, 'tailwind.css'),
  lang: 'ja',
  route: { exclude: excludedProjectPages },
  title: 'DevPulse',
  siteOrigin: origin.origin,
  plugins: [
    pluginRss({
      siteUrl: origin.origin,
      feed: {
        id: 'reports',
        title: 'DevPulse 日次進捗レポート',
        language: 'ja',
        item: (item) => {
          const date = /^\/reports\/(\d{4}-\d{2}-\d{2})\//.exec(
            new URL(item.link).pathname,
          )?.[1];
          const report = date ? reportsByDate.get(date) : undefined;
          if (!report) throw new Error('Missing saved report for RSS item');
          return {
            ...item,
            id: item.link,
            description: feedExcerpt(report.summary),
            content: '',
          };
        },
        test: (page) => {
          const date = /^\/reports\/(\d{4}-\d{2}-\d{2})\//.exec(
            page.routePath,
          )?.[1];
          return Boolean(date && feedDates.has(date));
        },
        output: { type: 'rss', filename: 'reports.xml' },
      },
    }),
  ],
  icon: '/utakata-icon.webp',
  logo: '/utakata-icon.webp',
  logoText: 'uDCG',
  builderConfig: {
    plugins: [pluginTailwindcss()],
    source: {
      define: {
        __DEVPULSE_BUILD_TIME__: JSON.stringify(DEVPULSE_BUILD_TIME),
        __DEVPULSE_REPORT_DATES__: JSON.stringify(reportDates),
        __DEVPULSE_LATEST_REPORT__: JSON.stringify(reports[0] ?? null),
        __DEVPULSE_API_URL__: JSON.stringify(
          process.env.DEVPULSE_API_URL ?? '/api',
        ),
        __DEVPULSE_PUBLIC_DATA__: JSON.stringify(DEVPULSE_PUBLIC_DATA),
      },
    },
  },
  themeConfig: {
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/web-infra-dev/rspress',
      },
    ],
  },
});
