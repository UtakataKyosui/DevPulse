export const LIFECYCLES = [
  'planned',
  'active',
  'paused',
  'completed',
  'archived',
] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];

export type HealthStatus = 'stable' | 'warning' | 'stalled' | 'unknown';

export type RepositoryVisibility = 'public' | 'private';

export interface ProjectDefinition {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** owner/repo */
  repository: string;
  /** 明示的 opt-in のみ公開 */
  published: boolean;
  lifecycle: Lifecycle;
  /** repo 内の Milestone 番号 */
  featuredMilestoneNumber?: number;
}

export interface GitHubMilestoneSnapshot {
  number: number;
  title: string;
  description: string | null;
  state: 'open' | 'closed';
  openIssues: number;
  closedIssues: number;
  dueOn: string | null;
  htmlUrl: string;
}

export interface IssueClosure {
  number: number;
  /** GitHub の closed_at (ISO 8601) */
  closedAt: string;
  /** pull_request フィールドを持つ項目。Throughput から除外する */
  isPullRequest: boolean;
}

export interface GitHubProjectSnapshot {
  repository: string;
  /** 公開可否の検証に使う。公開成果物には出力しない */
  visibility: RepositoryVisibility;
  milestones: GitHubMilestoneSnapshot[];
  /**
   * リモートで確認できた最新コミットの日時。committer date を暫定採用し、
   * push 日時ではない。未取得は null
   */
  lastActivityAt: string | null;
  /** closed_at を持つ Issue/PR。Throughput 集計用 */
  issueClosures: IssueClosure[];
  fetchedAt: string;
}

export interface HealthAssessment {
  /** Lifecycle が active のときだけ true。それ以外は評価しない */
  evaluated: boolean;
  /** evaluated: false のときは常に unknown(stalled にしない) */
  status: HealthStatus;
  /** 表示ラベル。未評価時は Lifecycle のラベル(休止中/完了 等) */
  label: string;
  /** 最終コミットからの Asia/Tokyo 暦日差。算出不能は null */
  elapsedDays: number | null;
}

export interface ThroughputDay {
  /** Asia/Tokyo の暦日 YYYY-MM-DD */
  date: string;
  closed: boolean;
  count: number;
}

export interface IssueThroughput {
  /** 古い順。0 件の日も含む */
  days: ThroughputDay[];
  totalClosed: number;
  closedDays: number;
}

export type DeadlineStatus =
  | 'none'
  | 'on_track'
  | 'due_soon'
  | 'overdue'
  | 'completed';

export interface DeadlineAssessment {
  status: DeadlineStatus;
  /** 期限までの Asia/Tokyo 暦日数。超過は負。期限なしは null */
  daysUntilDue: number | null;
}

export interface DataFreshness {
  fetchedAt: string | null;
  ageHours: number | null;
  stale: boolean;
}

/** Progress / Health / Deadline / Throughput は互いに独立 */
export interface ProjectView {
  definition: ProjectDefinition;
  snapshot: GitHubProjectSnapshot | null;
  /** featured Milestone の Issue 消化率。未算出は null */
  progressPercent: number | null;
  health: HealthAssessment;
  throughput: IssueThroughput;
  deadline: DeadlineAssessment;
  freshness: DataFreshness;
}
