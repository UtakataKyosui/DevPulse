import {
  Layout as BaseLayout,
  type LayoutProps,
} from '@rspress/core/theme-original';
import { loadProjectViews } from '../src/components/devpulse/dashboard-data.ts';
import { ProjectDashboard } from '../src/components/devpulse/ProjectDashboard.tsx';

// モジュール評価時に 1 度だけ算出する(SSG とクライアントで同じ入力になる)
const views = loadProjectViews();

// afterHero は Home(pageType: home)の Hero 直下のみに描画され、doc ページには影響しない
export function Layout(props: LayoutProps) {
  return (
    <BaseLayout {...props} afterHero={<ProjectDashboard views={views} />} />
  );
}

export * from '@rspress/core/theme-original';
