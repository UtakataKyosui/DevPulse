import type {
  GitHubMilestoneSnapshot,
  GitHubProjectSnapshot,
  ProjectDefinition,
} from '@devpulse/domain/devpulse/types';

/**
 * featuredMilestoneNumber で明示指定された Milestone を返す。
 * 未設定・snapshot なし・該当なしは null(推測や平均で補わない)。
 * closed の Milestone もそのまま返す。
 */
export function selectFeaturedMilestone(
  definition: Pick<ProjectDefinition, 'featuredMilestoneNumber'>,
  snapshot: Pick<GitHubProjectSnapshot, 'milestones'> | null,
): GitHubMilestoneSnapshot | null {
  if (!snapshot || definition.featuredMilestoneNumber === undefined) {
    return null;
  }
  return (
    snapshot.milestones.find(
      (m) => m.number === definition.featuredMilestoneNumber,
    ) ?? null
  );
}
