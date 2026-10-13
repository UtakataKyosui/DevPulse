import {
  Layout as BaseLayout,
  type LayoutProps,
} from '@rspress/core/theme-original';
import { useEffect, useMemo, useState } from 'react';
import {
  getBuildTime,
  loadProjectViews,
} from '../src/components/devpulse/dashboard-data.ts';
import { ProjectDashboard } from '../src/components/devpulse/ProjectDashboard.tsx';

// afterHero は Home(pageType: home)の Hero 直下のみに描画され、doc ページには影響しない
export function Layout(props: LayoutProps) {
  // 初回描画はビルド時刻で SSG と一致させ、マウント後に閲覧時刻で Health・期限・鮮度を再評価する
  const [now, setNow] = useState(getBuildTime);
  useEffect(() => setNow(new Date()), []);
  const views = useMemo(() => loadProjectViews(now), [now]);
  return (
    <BaseLayout {...props} afterHero={<ProjectDashboard views={views} />} />
  );
}

export * from '@rspress/core/theme-original';
