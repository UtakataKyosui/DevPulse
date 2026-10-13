import type { GitHubMilestoneSnapshot } from './types.ts';

/** closed / (open + closed) * 100。件数 0 は null(未算出)。丸めは表示層 */
export function calcProgressPercent(
  milestone: Pick<GitHubMilestoneSnapshot, 'openIssues' | 'closedIssues'>,
): number | null {
  const total = milestone.openIssues + milestone.closedIssues;
  if (total === 0) return null;
  return (milestone.closedIssues / total) * 100;
}
