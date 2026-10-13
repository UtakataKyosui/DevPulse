import * as path from 'node:path';
import { defineConfig } from '@rspress/core';
import projectsJson from './src/data/devpulse/projects.sample.json';
import snapshotsJson from './src/data/devpulse/snapshots.sample.json';
import {
  projectConfigSchema,
  selectPublicData,
  snapshotFileSchema,
} from './src/lib/devpulse/index.ts';

// ビルド 1 回につき 1 度だけ評価され、SSG とクライアントの双方に同じ値が埋め込まれる(hydration 不整合の防止)
const DEVPULSE_BUILD_TIME = new Date().toISOString();

// 公開フィルタをビルド境界で適用し、非公開データをクライアント成果物へ含めない
const DEVPULSE_PUBLIC_DATA = selectPublicData(
  projectConfigSchema.parse(projectsJson).projects,
  snapshotFileSchema.parse(snapshotsJson).snapshots,
);

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  lang: 'en',
  title: 'My Site',
  icon: '/rspress-icon.png',
  logo: {
    light: '/rspress-light-logo.png',
    dark: '/rspress-dark-logo.png',
  },
  builderConfig: {
    source: {
      define: {
        __DEVPULSE_BUILD_TIME__: JSON.stringify(DEVPULSE_BUILD_TIME),
        __DEVPULSE_API_URL__: JSON.stringify(
          process.env.DEVPULSE_API_URL ?? '',
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
