import {
  calcProgressPercent,
  type DeadlineStatus,
  HEALTH_LABELS,
  type HealthStatus,
  LIFECYCLE_LABELS,
  type Lifecycle,
  type ProjectView,
  selectFeaturedMilestone,
  toJstDate,
} from '../../lib/devpulse/index.ts';

/**
 * 表示トーン。stable/warning/stalled/unknown は active の Activity Health、
 * inactive は Health 評価対象外(planned/paused/completed/archived)。
 * inactive は赤にしない。
 */
export type HealthTone = HealthStatus | 'inactive';

export const HEALTH_ICONS: Record<HealthTone, string> = {
  stable: '✓',
  warning: '▲',
  stalled: '✕',
  unknown: '?',
  inactive: '–',
};

export type EmptyReason =
  | 'unsynced'
  | 'milestone_unset'
  | 'milestone_missing'
  | 'milestone_empty';

const EMPTY_MESSAGES: Record<EmptyReason, string> = {
  unsynced: 'データ未取得(同期前、または取得に失敗しました)',
  milestone_unset: 'Milestone が未設定です',
  milestone_missing: '指定された Milestone が見つかりません',
  milestone_empty: 'Milestone に Issue がありません',
};

export interface ProgressModel {
  percent: number | null;
  /** 表示テキスト。未算出は「—」 */
  text: string;
  ariaLabel: string;
}

export interface CardModel {
  id: string;
  name: string;
  description: string;
  href: string;
  lifecycle: Lifecycle;
  lifecycleLabel: string;
  milestoneTitle: string | null;
  milestones: {
    number: number;
    title: string;
    href: string;
    issueText: string;
    progress: ProgressModel;
  }[];
  emptyMessage: string | null;
  progress: ProgressModel;
  health: {
    tone: HealthTone;
    label: string;
    icon: string;
    evaluated: boolean;
  };
  lastCommitText: string;
  deadline: { status: DeadlineStatus; text: string };
  stale: boolean;
}

export interface SummaryModel {
  total: number;
  stable: number;
  warning: number;
  stalled: number;
  paused: number;
  unknown: number;
  /** planned / completed / archived。いずれの Health 区分にも入れない */
  other: number;
}

export interface SyncModel {
  /** 最も新しい fetchedAt(ISO)。1 件も無ければ null */
  latestFetchedAt: string | null;
  latestFetchedText: string | null;
  staleCount: number;
  stale: boolean;
}

export interface DashboardModel {
  summary: SummaryModel;
  cards: CardModel[];
  sync: SyncModel;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Asia/Tokyo 固定の `YYYY-MM-DD HH:mm JST`。ロケール/実行環境に依存しない */
export function formatJstDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const d = new Date(time + 9 * 3_600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} JST`;
}

function formatElapsed(days: number): string {
  return days === 0 ? '今日' : `${days}日前`;
}

export function describeProgress(
  percent: number | null,
  healthLabel: string,
): ProgressModel {
  if (percent === null) {
    return {
      percent: null,
      text: '—',
      ariaLabel:
        'Issue消化率: 未算出。ゲージの長さは進捗、色はActivity Healthを表します',
    };
  }
  // 未完了(100 未満)を 100% と誤表示しない
  const rounded = percent < 100 ? Math.min(Math.round(percent), 99) : 100;
  return {
    percent,
    text: `${rounded}%`,
    ariaLabel: `Issue消化率 ${rounded}%(ゲージの長さ)。ゲージの色は進捗ではなくActivity Health: ${healthLabel}`,
  };
}

function describeDeadline(view: ProjectView, dueOn: string | null) {
  const { status, daysUntilDue } = view.deadline;
  const date = dueOn ? toJstDate(dueOn) : null;
  const dated = date ? `期限 ${date}` : '期限なし';
  switch (status) {
    case 'none':
      return '期限なし';
    case 'completed':
      return date ? `完了(${dated})` : '完了';
    case 'overdue':
      return `期限超過 ${Math.abs(daysUntilDue ?? 0)}日(${dated})`;
    case 'due_soon':
      return `期限間近: あと${daysUntilDue}日(${dated})`;
    case 'on_track':
      return `${dated}(あと${daysUntilDue}日)`;
  }
}

export function toCardModel(view: ProjectView): CardModel {
  const { definition, snapshot, health } = view;
  const milestone = selectFeaturedMilestone(definition, snapshot);

  let emptyReason: EmptyReason | null = null;
  if (!snapshot) emptyReason = 'unsynced';
  else if (definition.featuredMilestoneNumber === undefined)
    emptyReason = 'milestone_unset';
  else if (!milestone) emptyReason = 'milestone_missing';
  else if (milestone.openIssues + milestone.closedIssues === 0)
    emptyReason = 'milestone_empty';

  const tone: HealthTone = health.evaluated ? health.status : 'inactive';
  const lifecycleLabel =
    definition.lifecycle === 'active'
      ? '進行中'
      : LIFECYCLE_LABELS[definition.lifecycle];
  const healthLabel = health.evaluated
    ? HEALTH_LABELS[health.status]
    : `${health.label}(評価対象外)`;

  const lastActivity = snapshot?.lastActivityAt ?? null;
  const lastDate = lastActivity ? toJstDate(lastActivity) : null;
  const lastCommitText =
    lastDate && health.elapsedDays !== null
      ? `${lastDate}(${formatElapsed(health.elapsedDays)})`
      : lastDate
        ? lastDate
        : '未取得';

  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    href: `/projects/${definition.slug}/`,
    lifecycle: definition.lifecycle,
    lifecycleLabel,
    milestoneTitle: milestone?.title ?? null,
    milestones: (snapshot?.milestones ?? []).map((m) => ({
      number: m.number,
      title: m.title,
      href: m.htmlUrl,
      issueText: `完了 ${m.closedIssues} / ${m.openIssues + m.closedIssues} 件`,
      progress: describeProgress(calcProgressPercent(m), healthLabel),
    })),
    emptyMessage: emptyReason ? EMPTY_MESSAGES[emptyReason] : null,
    progress: describeProgress(view.progressPercent, healthLabel),
    health: {
      tone,
      label: healthLabel,
      icon: HEALTH_ICONS[tone],
      evaluated: health.evaluated,
    },
    lastCommitText,
    deadline: {
      status: view.deadline.status,
      text: describeDeadline(view, milestone?.dueOn ?? null),
    },
    stale: view.freshness.stale,
  };
}

export function summarize(views: ProjectView[]): SummaryModel {
  const summary: SummaryModel = {
    total: views.length,
    stable: 0,
    warning: 0,
    stalled: 0,
    paused: 0,
    unknown: 0,
    other: 0,
  };
  for (const { health, definition } of views) {
    if (health.evaluated) summary[health.status] += 1;
    else if (definition.lifecycle === 'paused') summary.paused += 1;
    else summary.other += 1;
  }
  return summary;
}

export function summarizeSync(views: ProjectView[]): SyncModel {
  let latest: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  let staleCount = 0;
  for (const { freshness } of views) {
    if (freshness.stale) staleCount += 1;
    const time = freshness.fetchedAt
      ? Date.parse(freshness.fetchedAt)
      : Number.NaN;
    if (!Number.isNaN(time) && time > latestTime) {
      latestTime = time;
      latest = freshness.fetchedAt;
    }
  }
  return {
    latestFetchedAt: latest,
    latestFetchedText: formatJstDateTime(latest),
    staleCount,
    stale: staleCount > 0,
  };
}

export function buildDashboardModel(views: ProjectView[]): DashboardModel {
  return {
    summary: summarize(views),
    cards: views.map(toCardModel),
    sync: summarizeSync(views),
  };
}
