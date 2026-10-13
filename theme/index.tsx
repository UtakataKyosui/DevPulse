import { useSidebarDynamic } from '@rspress/core/runtime';
import {
  Layout as BaseLayout,
  type LayoutProps,
  SidebarList,
} from '@rspress/core/theme-original';
import { ProjectDashboard } from '../src/components/devpulse/ProjectDashboard.tsx';
import { useProjectViews } from '../src/components/devpulse/use-project-views.ts';

// afterHero は Home(pageType: home)の Hero 直下のみに描画され、doc ページには影響しない
export function Layout(props: LayoutProps) {
  return <BaseLayout {...props} afterHero={<HomeDashboard />} />;
}

// index だけのプロジェクトは単独リンク。関連ページが追加されれば通常のグループになる。
export function Sidebar() {
  const [sidebarData, setSidebarData] = useSidebarDynamic();
  const items = sidebarData.map((item) => {
    if (
      'items' in item &&
      item.items.length === 0 &&
      item.link?.startsWith('/projects/')
    ) {
      const { items: _items, ...link } = item;
      return { ...link, link: item.link };
    }
    return item;
  });
  return <SidebarList sidebarData={items} setSidebarData={setSidebarData} />;
}

// データ取得は Home の描画時だけ行い、通常ドキュメントでは API を呼ばない
function HomeDashboard() {
  const { views, state } = useProjectViews();
  return <ProjectDashboard views={views} loadState={state} />;
}

export * from '@rspress/core/theme-original';
