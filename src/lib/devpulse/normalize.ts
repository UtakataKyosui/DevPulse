import { rawMilestonesSchema } from './schema.ts';
import type {
  GitHubMilestoneSnapshot,
  GitHubProjectSnapshot,
  RepositoryVisibility,
} from './types.ts';

/** REST API の Milestone 配列を正規化する。未知のフィールド(トークン等)は捨てる */
export function normalizeMilestones(raw: unknown): GitHubMilestoneSnapshot[] {
  return rawMilestonesSchema.parse(raw).map((m) => ({
    number: m.number,
    title: m.title,
    description: m.description ?? null,
    state: m.state,
    openIssues: m.open_issues,
    closedIssues: m.closed_issues,
    dueOn: m.due_on ?? null,
    htmlUrl: m.html_url,
  }));
}

export function normalizeProjectSnapshot(input: {
  repository: string;
  visibility: RepositoryVisibility;
  /** ページネーション済みの全ページを連結した配列 */
  rawMilestones: unknown;
  lastActivityAt?: string | null;
  fetchedAt: string;
}): GitHubProjectSnapshot {
  return {
    repository: input.repository,
    visibility: input.visibility,
    milestones: normalizeMilestones(input.rawMilestones),
    lastActivityAt: input.lastActivityAt ?? null,
    fetchedAt: input.fetchedAt,
  };
}
