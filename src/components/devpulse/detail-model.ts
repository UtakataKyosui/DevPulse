import {
  type GitHubMilestoneSnapshot,
  type ProjectView,
  toJstDate,
} from '../../lib/devpulse/index.ts';
import { type CardModel, formatJstDateTime, toCardModel } from './model.ts';

export interface MilestoneRow {
  number: number;
  title: string;
  stateLabel: string;
  featured: boolean;
  dueText: string;
  issueText: string;
  href: string;
}

export interface ThroughputRow {
  date: string;
  closed: boolean;
  count: number;
}

export interface ClosureRow {
  number: number;
  closedDate: string;
  href: string;
}

export interface NextActionsModel {
  title: string | null;
  openIssues: number | null;
  href: string | null;
  /** 詳細な Issue 一覧は Snapshot に無いため、GitHub への導線のみを示す */
  message: string;
}

export interface DetailModel {
  /** Home と同じ表示モデル。進捗/Health/期限を再計算しない */
  card: CardModel;
  repositoryUrl: string;
  fetchedText: string | null;
  milestones: MilestoneRow[];
  throughput: {
    rows: ThroughputRow[];
    totalClosed: number;
    closedDays: number;
  };
  recentClosures: ClosureRow[];
  nextActions: NextActionsModel;
}

const RECENT_CLOSURE_LIMIT = 5;

function toMilestoneRow(
  m: GitHubMilestoneSnapshot,
  featuredNumber: number | undefined,
): MilestoneRow {
  const due = m.dueOn ? toJstDate(m.dueOn) : null;
  return {
    number: m.number,
    title: m.title,
    stateLabel: m.state === 'open' ? '進行中' : '終了',
    featured: m.number === featuredNumber,
    dueText: due ?? '期限なし',
    issueText: `未完了 ${m.openIssues} / 完了 ${m.closedIssues}`,
    href: m.htmlUrl,
  };
}

export function buildDetailModel(view: ProjectView): DetailModel {
  const { definition, snapshot, throughput } = view;
  const repositoryUrl = `https://github.com/${definition.repository}`;
  const milestones = (snapshot?.milestones ?? []).map((m) =>
    toMilestoneRow(m, definition.featuredMilestoneNumber),
  );
  const featured = snapshot?.milestones.find(
    (m) => m.number === definition.featuredMilestoneNumber,
  );

  const recentClosures = [...(snapshot?.issueClosures ?? [])]
    .filter((c) => !c.isPullRequest)
    .sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt))
    .slice(0, RECENT_CLOSURE_LIMIT)
    .map((c) => ({
      number: c.number,
      closedDate: toJstDate(c.closedAt) ?? '不明',
      href: `${repositoryUrl}/issues/${c.number}`,
    }));

  let nextActions: NextActionsModel;
  if (!featured) {
    nextActions = {
      title: null,
      openIssues: null,
      href: `${repositoryUrl}/issues`,
      message:
        '表示対象の Milestone が未設定、またはデータ未取得です。GitHub の Issue 一覧を確認してください。',
    };
  } else if (featured.openIssues === 0) {
    nextActions = {
      title: featured.title,
      openIssues: 0,
      href: featured.htmlUrl,
      message: '未完了の Issue はありません。',
    };
  } else {
    nextActions = {
      title: featured.title,
      openIssues: featured.openIssues,
      href: featured.htmlUrl,
      message: `未完了の Issue が ${featured.openIssues} 件あります。一覧は GitHub で確認できます。`,
    };
  }

  return {
    card: toCardModel(view),
    repositoryUrl,
    fetchedText: formatJstDateTime(view.freshness.fetchedAt),
    milestones,
    throughput: {
      rows: throughput.days,
      totalClosed: throughput.totalClosed,
      closedDays: throughput.closedDays,
    },
    recentClosures,
    nextActions,
  };
}
