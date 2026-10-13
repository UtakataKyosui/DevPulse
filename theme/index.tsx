import {
  Layout as BaseLayout,
  type LayoutProps,
} from '@rspress/core/theme-original';
import { ProjectDashboard } from '../src/components/devpulse/ProjectDashboard.tsx';
import { useProjectViews } from '../src/components/devpulse/use-project-views.ts';

// afterHero は Home(pageType: home)の Hero 直下のみに描画され、doc ページには影響しない
export function Layout(props: LayoutProps) {
  const { views, state } = useProjectViews();
  return (
    <BaseLayout
      {...props}
      afterHero={<ProjectDashboard views={views} loadState={state} />}
    />
  );
}

export * from '@rspress/core/theme-original';
