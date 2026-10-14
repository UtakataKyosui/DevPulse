import { assessDeadline, DEFAULT_DUE_SOON_DAYS } from './deadline.ts';
import { assessFreshness, DEFAULT_STALE_AFTER_HOURS } from './freshness.ts';
import { assessHealth } from './health.ts';
import { calcProgressPercent } from './progress.ts';
import { repositoryKey } from './repository-key.ts';
import { selectFeaturedMilestone } from './select-milestone.ts';
import { sortProjectsByTier } from './sort-projects.ts';
import { calcIssueThroughput } from './throughput.ts';
import type {
  GitHubProjectSnapshot,
  ProjectDefinition,
  ProjectView,
} from './types.ts';

export interface BuildViewsOptions {
  /** 判定基準時刻。純粋性とテスト容易性のため必須 */
  now: Date;
  dueSoonDays?: number;
  staleAfterHours?: number;
}

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
  options: BuildViewsOptions,
): ProjectView[] {
  const { now } = options;
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
      health: assessHealth({
        lifecycle: definition.lifecycle,
        lastActivityAt: snapshot.lastActivityAt,
        now,
      }),
      throughput: calcIssueThroughput(snapshot.issueClosures, now),
      deadline: assessDeadline(
        milestone,
        now,
        options.dueSoonDays ?? DEFAULT_DUE_SOON_DAYS,
      ),
      freshness: assessFreshness(
        snapshot.fetchedAt,
        now,
        options.staleAfterHours ?? DEFAULT_STALE_AFTER_HOURS,
      ),
    });
  }
  // Home・日次レポートの並びを Tier 順に揃える
  return sortProjectsByTier(views, (view) => view.definition.tier);
}

/**
 * 公開成果物に含めてよい定義と Snapshot だけを返す。
 * published: false の定義、および公開状態を検証できない(public な Snapshot が無い)定義と Snapshot を除く。
 * クライアントへ渡す前(ビルド境界)で適用する。
 */
export function selectPublicData(
  definitions: ProjectDefinition[],
  snapshots: GitHubProjectSnapshot[],
): {
  projects: ProjectDefinition[];
  snapshots: GitHubProjectSnapshot[];
} {
  const publicSnapshots = new Map(
    snapshots
      .filter((s) => s.visibility === 'public')
      .map((s) => [repositoryKey(s.repository), s]),
  );
  const projects = definitions.filter(
    (definition) =>
      definition.published &&
      publicSnapshots.has(repositoryKey(definition.repository)),
  );
  const keys = new Set(projects.map((p) => repositoryKey(p.repository)));
  return {
    projects,
    snapshots: [...publicSnapshots.values()].filter((s) =>
      keys.has(repositoryKey(s.repository)),
    ),
  };
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
      issueClosures: snapshot.issueClosures,
      fetchedAt: snapshot.fetchedAt,
    },
  };
}
