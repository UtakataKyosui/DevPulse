import {
  Layout as BaseLayout,
  type LayoutProps,
} from '@rspress/core/theme-original';
import { ProjectDashboard } from '../src/components/devpulse/ProjectDashboard.tsx';
import { useProjectViews } from '../src/components/devpulse/use-project-views.ts';
import { ReportOverview } from '../src/components/reports/ReportOverview.tsx';

// afterHero は Home(pageType: home)の Hero 直下のみに描画され、doc ページには影響しない
export function Layout(props: LayoutProps) {
  return <BaseLayout {...props} afterHero={<HomeDashboard />} />;
}

// データ取得は Home の描画時だけ行い、通常ドキュメントでは API を呼ばない
function HomeDashboard() {
  const { views, state } = useProjectViews();
  return (
    <>
      <ReportOverview compact />
      <ProjectDashboard views={views} loadState={state} />
    </>
  );
}

export * from '@rspress/core/theme-original';
