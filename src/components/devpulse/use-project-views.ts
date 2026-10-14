import { useEffect, useMemo, useState } from 'react';
import {
  buildProjectViews,
  type ProjectView,
  selectPublicData,
} from '../../lib/devpulse/index.ts';
import { getBuildTime } from './dashboard-data.ts';
import {
  fetchProjects,
  fetchSnapshots,
  getApiBaseUrl,
} from './snapshot-client.ts';

/**
 * - static: API 未設定。表示するデータなし
 * - loading: API 取得中。表示するデータなし
 * - ready: API のデータを表示中
 * - error: API 取得に失敗。表示するデータなし
 */
export type LoadState = 'static' | 'loading' | 'ready' | 'error';

type Live = {
  state: LoadState;
  data: ReturnType<typeof selectPublicData> | null;
};

export function useProjectViews(): { views: ProjectView[]; state: LoadState } {
  const apiBaseUrl = getApiBaseUrl();
  // 初回描画はビルド時刻で SSG と一致させ、マウント後に閲覧時刻で Health・期限・鮮度を再評価する
  const [now, setNow] = useState(getBuildTime);
  const [live, setLive] = useState<Live>({
    state: apiBaseUrl ? 'loading' : 'static',
    data: null,
  });

  useEffect(() => {
    setNow(new Date());
    if (!apiBaseUrl) return;
    const controller = new AbortController();
    Promise.all([
      fetchProjects(apiBaseUrl, controller.signal),
      fetchSnapshots(apiBaseUrl, controller.signal),
    ]).then(
      ([projects, snapshots]) =>
        setLive({
          state: 'ready',
          data: selectPublicData(projects, snapshots),
        }),
      () => {
        if (!controller.signal.aborted) {
          setLive({ state: 'error', data: null });
        }
      },
    );
    return () => controller.abort();
  }, [apiBaseUrl]);

  const views = useMemo(
    () =>
      live.data
        ? buildProjectViews(live.data.projects, live.data.snapshots, { now })
        : [],
    [now, live.data],
  );

  return { views, state: live.state };
}
