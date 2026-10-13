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

export interface GitHubProjectSnapshot {
  repository: string;
  /** 公開可否の検証に使う。公開成果物には出力しない */
  visibility: RepositoryVisibility;
  milestones: GitHubMilestoneSnapshot[];
  lastActivityAt: string | null;
  fetchedAt: string;
}

export interface ProjectView {
  definition: ProjectDefinition;
  snapshot: GitHubProjectSnapshot | null;
  /** featured Milestone の Issue 消化率。未算出は null */
  progressPercent: number | null;
  /** 算出ルールは #4。#3 では unknown を返す */
  health: HealthStatus;
}
