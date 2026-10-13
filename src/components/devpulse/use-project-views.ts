import { useEffect, useMemo, useState } from 'react';
import {
  buildProjectViews,
  type ProjectView,
  selectPublicData,
} from '../../lib/devpulse/index.ts';
import {
  getBuildTime,
  loadProjectViews,
  loadPublicData,
} from './dashboard-data.ts';
import { fetchSnapshots, getApiBaseUrl } from './snapshot-client.ts';

/**
 * - static: API 未設定。ビルド同梱データのみ
 * - loading: API 取得中。ビルド同梱データを暫定表示
 * - ready: API のデータを表示中
 * - error: API 取得に失敗。ビルド同梱データを表示し続ける
 */
export type LoadState = 'static' | 'loading' | 'ready' | 'error';

export function useProjectViews(): { views: ProjectView[]; state: LoadState } {
  const apiBaseUrl = getApiBaseUrl();
  // 初回描画はビルド時刻で SSG と一致させ、マウント後に閲覧時刻で Health・期限・鮮度を再評価する
  const [now, setNow] = useState(getBuildTime);
  const [live, setLive] = useState<{
    state: LoadState;
    snapshots: Parameters<typeof selectPublicData>[1] | null;
  }>({ state: apiBaseUrl ? 'loading' : 'static', snapshots: null });

  useEffect(() => {
    setNow(new Date());
    if (!apiBaseUrl) return;
    const controller = new AbortController();
    fetchSnapshots(apiBaseUrl, controller.signal).then(
      (snapshots) => setLive({ state: 'ready', snapshots }),
      () => {
        if (!controller.signal.aborted) {
          setLive({ state: 'error', snapshots: null });
        }
      },
    );
    return () => controller.abort();
  }, [apiBaseUrl]);

  const views = useMemo(() => {
    if (!live.snapshots) return loadProjectViews(now);
    const { projects } = loadPublicData();
    const data = selectPublicData(projects, live.snapshots);
    return buildProjectViews(data.projects, data.snapshots, { now });
  }, [now, live.snapshots]);

  return { views, state: live.state };
}
