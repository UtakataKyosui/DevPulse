import * as path from 'node:path';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';
import { defineConfig } from '@rspress/core';
import projectsJson from './src/data/devpulse/projects.json';
import snapshotsJson from './src/data/devpulse/snapshots.json';
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
  globalStyles: path.join(__dirname, 'tailwind.css'),
  lang: 'ja',
  title: 'DevPulse',
  icon: '/utakata-icon.webp',
  logo: '/utakata-icon.webp',
  builderConfig: {
    plugins: [pluginTailwindcss()],
    source: {
      define: {
        __DEVPULSE_BUILD_TIME__: JSON.stringify(DEVPULSE_BUILD_TIME),
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
