import { calcProgressPercent } from './progress.ts';
import { repositoryKey } from './repository-key.ts';
import { selectFeaturedMilestone } from './select-milestone.ts';
import type {
  GitHubProjectSnapshot,
  ProjectDefinition,
  ProjectView,
} from './types.ts';

/**
 * 公開対象の ProjectView だけを返す。
 * - published: true のみ
 * - 公開状態を検証できた(public な snapshot がある)ものだけ出力する。
 *   snapshot が無い(未同期/取得失敗)private かもしれない定義は出力しない
 * - リポジトリは大文字小文字を区別せず照合する
 */
export function buildProjectViews(
  definitions: ProjectDefinition[],
  snapshots: GitHubProjectSnapshot[],
): ProjectView[] {
  const byRepo = new Map(
    snapshots.map((s) => [repositoryKey(s.repository), s]),
  );
  const views: ProjectView[] = [];

  for (const definition of definitions) {
    if (!definition.published) continue;
    const snapshot = byRepo.get(repositoryKey(definition.repository));
    if (snapshot?.visibility !== 'public') continue;

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
