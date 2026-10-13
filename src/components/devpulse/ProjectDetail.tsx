import { createContext, type ReactNode, useContext } from 'react';
import { buildDetailModel, type DetailModel } from './detail-model.ts';
import { LoadNotice } from './LoadNotice.tsx';
import { ProgressGauge } from './ProgressGauge.tsx';
import { useProjectViews } from './use-project-views.ts';

import './dashboard.css';

const DetailContext = createContext<DetailModel | null>(null);

/** MDX 本文の見出し(TOC 対象)を保ったまま、配下の部品へ ProjectView 由来のモデルを渡す */
export function ProjectDetail({
  slug,
  children,
}: {
  slug: string;
  children?: ReactNode;
}) {
  const { views, state } = useProjectViews();
  const view = views.find((v) => v.definition.slug === slug);
  return (
    <DetailContext.Provider value={view ? buildDetailModel(view) : null}>
      <div className="devpulse-detail">
        <LoadNotice state={state} />
        {children}
      </div>
    </DetailContext.Provider>
  );
}

function Unavailable() {
  return (
    <p className="devpulse-detail__unavailable" role="status">
      進捗データを表示できません(未同期、または非公開・取得失敗)。
    </p>
  );
}

export function ProjectOverview() {
  const model = useContext(DetailContext);
  if (!model) return <Unavailable />;
  const { card, repositoryUrl } = model;
  return (
    <dl className="devpulse-card__meta devpulse-detail__overview">
      <dt>名称</dt>
      <dd>{card.name}</dd>
      <dt>説明</dt>
      <dd>{card.description}</dd>
      <dt>Lifecycle</dt>
      <dd>{card.lifecycleLabel}</dd>
      <dt>Repository</dt>
      <dd>
        <a href={repositoryUrl}>{repositoryUrl.replace('https://', '')}</a>
      </dd>
    </dl>
  );
}

export function ProjectStatus() {
  const model = useContext(DetailContext);
  if (!model) return <Unavailable />;
  const { card } = model;
  return (
    <>
      <dl className="devpulse-card__meta devpulse-detail__status">
        <dt>Milestone</dt>
        <dd>{card.milestoneTitle ?? '未設定'}</dd>
        <dt>Issue消化率</dt>
        <dd>
          <ProgressGauge progress={card.progress} tone={card.health.tone} />
          {card.emptyMessage && (
            <span className="devpulse-card__empty">{card.emptyMessage}</span>
          )}
        </dd>
        <dt>Health</dt>
        <dd>
          <span className={`devpulse-badge devpulse-tone--${card.health.tone}`}>
            <span aria-hidden="true">{card.health.icon} </span>
            {card.health.label}
          </span>
        </dd>
        <dt>期限</dt>
        <dd className={`devpulse-deadline--${card.deadline.status}`}>
          {card.deadline.text}
        </dd>
        <dt>最終Commit</dt>
        <dd>{card.lastCommitText}</dd>
        <dt>最終同期</dt>
        <dd>
          {model.fetchedText ?? '未同期'}
          {card.stale && (
            <span className="devpulse-badge devpulse-badge--stale">
              <span aria-hidden="true">⚠ </span>
              データが古い
            </span>
          )}
        </dd>
      </dl>
      <p className="devpulse-detail__note">
        Issue消化率は選択した Milestone の Issue
        に対する割合で、開発全体の完成率ではありません。
      </p>
    </>
  );
}

export function MilestoneList() {
  const model = useContext(DetailContext);
  if (!model) return <Unavailable />;
  if (model.milestones.length === 0) {
    return (
      <p className="devpulse-detail__unavailable">Milestone はありません。</p>
    );
  }
  return (
    <ul className="devpulse-detail__list devpulse-milestones">
      {model.milestones.map((m) => (
        <li key={m.number}>
          <div>
            <a href={m.href}>{m.title}</a>
            {m.featured && <span className="devpulse-badge">現在地</span>}
            <small>
              {m.stateLabel} · {m.dueText} · {m.issueText}
            </small>
          </div>
          <ProgressGauge progress={m.progress} tone={model.card.health.tone} />
        </li>
      ))}
    </ul>
  );
}

export function IssueThroughput() {
  const model = useContext(DetailContext);
  if (!model) return <Unavailable />;
  const { rows, totalClosed, closedDays } = model.throughput;
  return (
    <>
      <p className="devpulse-detail__summary">
        直近 7 日間: <strong>{totalClosed} 件 Close</strong> · 活動 {closedDays}{' '}
        日<small>PR を除く</small>
      </p>
      <ul className="devpulse-throughput">
        {rows.map((d) => (
          <li key={d.date} title={`${d.date}: ${d.count} 件 Close`}>
            <time dateTime={d.date}>{d.date.slice(5).replace('-', '/')}</time>
            <strong>{d.count}</strong>
          </li>
        ))}
      </ul>
    </>
  );
}

export function RecentActivity() {
  const model = useContext(DetailContext);
  if (!model) return <Unavailable />;
  return (
    <>
      <p className="devpulse-detail__summary">
        最終Commit: {model.card.lastCommitText}
      </p>
      {model.recentClosures.length === 0 ? (
        <p>同期済みの最近 Close された Issue はありません。</p>
      ) : (
        <ul className="devpulse-recent">
          {model.recentClosures.map((c) => (
            <li key={c.number}>
              <a href={c.href}>#{c.number}</a>
              <time dateTime={c.closedDate}>{c.closedDate}</time>
              <span>Close</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function NextActions() {
  const model = useContext(DetailContext);
  if (!model) return <Unavailable />;
  const { nextActions } = model;
  return (
    <p>
      {nextActions.title && <strong>{nextActions.title}: </strong>}
      {nextActions.message}
      {nextActions.href && (
        <>
          {' '}
          <a href={nextActions.href}>GitHub で開く</a>
        </>
      )}
    </p>
  );
}
