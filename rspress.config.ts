import { readFileSync, writeFileSync } from 'node:fs';
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
import { prepareReports } from './src/lib/reports/prepare.ts';

const reportDates = prepareReports(__dirname);
const feedDates = new Set(reportDates.slice(0, 30));
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

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  globalStyles: path.join(__dirname, 'tailwind.css'),
  lang: 'ja',
  title: 'DevPulse',
  siteOrigin: origin.origin,
  plugins: [
    pluginRss({
      siteUrl: origin.origin,
      feed: {
        id: 'reports',
        title: 'DevPulse 日次進捗レポート',
        language: 'ja',
        item: (item) => ({ ...item, id: item.link }),
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
  icon: '/rspress-icon.png',
  logo: {
    light: '/rspress-light-logo.png',
    dark: '/rspress-dark-logo.png',
  },
  builderConfig: {
    plugins: [pluginTailwindcss()],
    source: {
      define: {
        __DEVPULSE_BUILD_TIME__: JSON.stringify(DEVPULSE_BUILD_TIME),
        __DEVPULSE_REPORT_DATES__: JSON.stringify(reportDates),
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
