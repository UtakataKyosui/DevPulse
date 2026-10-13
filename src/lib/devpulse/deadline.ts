import { jstCalendarDayDiff } from './jst.ts';
import type { DeadlineAssessment, GitHubMilestoneSnapshot } from './types.ts';

/** 暫定値。この日数以内(当日含む)を「期限間近」とする */
export const DEFAULT_DUE_SOON_DAYS = 7;

/**
 * Milestone の due_on から期限状態を算出する。Activity Health とは独立。
 * 完了: Milestone が closed、または Issue があり未完了が 0 件。
 */
export function assessDeadline(
  milestone: Pick<
    GitHubMilestoneSnapshot,
    'state' | 'dueOn' | 'openIssues' | 'closedIssues'
  > | null,
  now: Date,
  dueSoonDays: number = DEFAULT_DUE_SOON_DAYS,
): DeadlineAssessment {
  if (!milestone) return { status: 'none', daysUntilDue: null };
  const total = milestone.openIssues + milestone.closedIssues;
  const daysUntilDue = milestone.dueOn
    ? jstCalendarDayDiff(now, milestone.dueOn)
    : null;
  if (
    milestone.state === 'closed' ||
    (total > 0 && milestone.openIssues === 0)
  ) {
    return { status: 'completed', daysUntilDue };
  }
  if (daysUntilDue === null) return { status: 'none', daysUntilDue: null };
  if (daysUntilDue < 0) return { status: 'overdue', daysUntilDue };
  if (daysUntilDue <= dueSoonDays) return { status: 'due_soon', daysUntilDue };
  return { status: 'on_track', daysUntilDue };
}
