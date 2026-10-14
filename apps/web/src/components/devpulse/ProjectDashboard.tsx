import type { ProjectView } from '@devpulse/domain';
import { LoadNotice } from './LoadNotice.tsx';
import { buildDashboardModel } from './model.ts';
import { ProjectCard } from './ProjectCard.tsx';
import { ProjectSummary } from './ProjectSummary.tsx';
import { SyncStatus } from './SyncStatus.tsx';
import type { LoadState } from './use-project-views.ts';

import './dashboard.css';

export function ProjectDashboard({
  views,
  loadState = 'static',
}: {
  views: ProjectView[];
  loadState?: LoadState;
}) {
  const model = buildDashboardModel(views);
  return (
    <section className="devpulse-dashboard" aria-labelledby="devpulse-title">
      <h2 id="devpulse-title" className="devpulse-dashboard__title">
        プロジェクトの状況
      </h2>
      <LoadNotice state={loadState} />
      <SyncStatus sync={model.sync} />
      <ProjectSummary summary={model.summary} />
      <p className="devpulse-priority-note">
        着手優先度順に表示しています。同じ優先度では元の順序を保ちます。
        設定は管理画面で編集され、すべての閲覧者に共通です。
      </p>
      <p className="devpulse-legend">
        ゲージの<strong>長さ</strong>は Issue 消化率(Progress)、
        <strong>色</strong>は最終Commitからの経過(Activity
        Health)を表し、別の指標です:
        <span className="devpulse-tone--stable devpulse-legend__chip">
          ✓ 安定 0〜2日
        </span>
        <span className="devpulse-tone--warning devpulse-legend__chip">
          ▲ 注意 3〜4日
        </span>
        <span className="devpulse-tone--stalled devpulse-legend__chip">
          ✕ 停滞 5日以上
        </span>
        <span className="devpulse-tone--unknown devpulse-legend__chip">
          ? 不明
        </span>
        <span className="devpulse-tone--inactive devpulse-legend__chip">
          – 評価対象外(休止・完了等)
        </span>
      </p>
      {model.cards.length === 0 ? (
        <p className="devpulse-dashboard__empty">
          公開対象のプロジェクトがありません。
        </p>
      ) : (
        <ul className="devpulse-cards">
          {model.cards.map((card) => (
            <ProjectCard key={card.id} card={card} />
          ))}
        </ul>
      )}
    </section>
  );
}
