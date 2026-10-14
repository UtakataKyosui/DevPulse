import {
  rawIssuesSchema,
  rawMilestonesSchema,
} from '@devpulse/domain/devpulse/schema';
import type {
  GitHubMilestoneSnapshot,
  GitHubProjectSnapshot,
  IssueClosure,
  RepositoryVisibility,
} from '@devpulse/domain/devpulse/types';

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

/** Issues API の配列から closed_at を持つ項目だけを残す。pull_request の有無は区別して保持 */
export function normalizeIssueClosures(raw: unknown): IssueClosure[] {
  return rawIssuesSchema.parse(raw).flatMap((issue) =>
    issue.closed_at
      ? [
          {
            number: issue.number,
            closedAt: issue.closed_at,
            isPullRequest: issue.pull_request !== undefined,
          },
        ]
      : [],
  );
}

export function normalizeProjectSnapshot(input: {
  repository: string;
  visibility: RepositoryVisibility;
  /** ページネーション済みの全ページを連結した配列 */
  rawMilestones: unknown;
  /** 最新リモートコミットの日時(committer date 暫定) */
  lastActivityAt?: string | null;
  /** Issues API (state=closed) の全ページ連結。省略時は空 */
  rawIssues?: unknown;
  fetchedAt: string;
}): GitHubProjectSnapshot {
  return {
    repository: input.repository,
    visibility: input.visibility,
    milestones: normalizeMilestones(input.rawMilestones),
    lastActivityAt: input.lastActivityAt ?? null,
    issueClosures: normalizeIssueClosures(input.rawIssues ?? []),
    fetchedAt: input.fetchedAt,
  };
}
