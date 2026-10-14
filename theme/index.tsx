import { useSidebarDynamic } from '@rspress/core/runtime';
import {
  Layout as BaseLayout,
  type LayoutProps,
  SidebarList,
} from '@rspress/core/theme-original';
import { Settings } from 'lucide-react';
import { ProjectDashboard } from '../src/components/devpulse/ProjectDashboard.tsx';
import { useProjectViews } from '../src/components/devpulse/use-project-views.ts';
import { ReportOverview } from '../src/components/reports/ReportOverview.tsx';
import { Button } from '../src/components/ui/button.tsx';

// afterHero は Home(pageType: home)の Hero 直下のみに描画され、doc ページには影響しない
export function Layout(props: LayoutProps) {
  return (
    <BaseLayout
      {...props}
      afterHero={<HomeDashboard />}
      afterNavMenu={<AdminLink />}
    />
  );
}

// /admin は Worker が配信するため、クライアントルーターを通さずブラウザの通常遷移にする。
// 認証は Cloudflare Access が行う。
function AdminLink() {
  return (
    <Button variant="outline" size="sm" render={<a href="/admin" />}>
      <Settings />
      管理画面
    </Button>
  );
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
  return (
    <>
      <ReportOverview compact />
      <ProjectDashboard views={views} loadState={state} />
    </>
  );
}

export * from '@rspress/core/theme-original';
