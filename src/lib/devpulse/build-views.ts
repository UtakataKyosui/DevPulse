import { calcProgressPercent } from './progress.ts';
import { selectFeaturedMilestone } from './select-milestone.ts';
import type {
  GitHubProjectSnapshot,
  ProjectDefinition,
  ProjectView,
} from './types.ts';

/**
 * 公開対象の ProjectView だけを返す。
 * - published: true のみ
 * - snapshot が private(または別リポジトリ)なら出力しない
 * - snapshot が無い(取得失敗/未同期)場合は progress null・health unknown
 */
export function buildProjectViews(
  definitions: ProjectDefinition[],
  snapshots: GitHubProjectSnapshot[],
): ProjectView[] {
  const byRepo = new Map(snapshots.map((s) => [s.repository, s]));
  const views: ProjectView[] = [];

  for (const definition of definitions) {
    if (!definition.published) continue;
    const snapshot = byRepo.get(definition.repository) ?? null;
    if (snapshot && snapshot.visibility !== 'public') continue;

    const milestone = selectFeaturedMilestone(definition, snapshot);
    views.push({
      definition,
      snapshot,
      progressPercent: milestone ? calcProgressPercent(milestone) : null,
      health: 'unknown',
    });
  }
  return views;
}

/** 公開成果物向けに visibility を除去した JSON 化可能な形へ変換する */
export function toPublicView(view: ProjectView) {
  const { snapshot } = view;
  return {
    ...view,
    snapshot: snapshot && {
      repository: snapshot.repository,
      milestones: snapshot.milestones,
      lastActivityAt: snapshot.lastActivityAt,
      fetchedAt: snapshot.fetchedAt,
    },
  };
}
