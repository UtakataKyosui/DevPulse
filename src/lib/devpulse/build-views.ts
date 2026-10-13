import { assessDeadline, DEFAULT_DUE_SOON_DAYS } from './deadline.ts';
import { assessFreshness, DEFAULT_STALE_AFTER_HOURS } from './freshness.ts';
import { assessHealth } from './health.ts';
import { calcProgressPercent } from './progress.ts';
import { selectFeaturedMilestone } from './select-milestone.ts';
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
 * - snapshot が private(または別リポジトリ)なら出力しない
 * - snapshot が無い(取得失敗/未同期)場合は progress null・health unknown・freshness stale
 */
export function buildProjectViews(
  definitions: ProjectDefinition[],
  snapshots: GitHubProjectSnapshot[],
  options: BuildViewsOptions,
): ProjectView[] {
  const { now } = options;
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
      health: assessHealth({
        lifecycle: definition.lifecycle,
        lastActivityAt: snapshot?.lastActivityAt ?? null,
        now,
      }),
      throughput: calcIssueThroughput(snapshot?.issueClosures ?? [], now),
      deadline: assessDeadline(
        milestone,
        now,
        options.dueSoonDays ?? DEFAULT_DUE_SOON_DAYS,
      ),
      freshness: assessFreshness(
        snapshot?.fetchedAt ?? null,
        now,
        options.staleAfterHours ?? DEFAULT_STALE_AFTER_HOURS,
      ),
    });
  }
  return views;
}

/**
 * 公開成果物に含めてよい定義と Snapshot だけを返す。
 * published: false の定義、および private(または別リポジトリ)の Snapshot とその定義を除く。
 * クライアントへ渡す前(ビルド境界)で適用する。
 */
export function selectPublicData(
  definitions: ProjectDefinition[],
  snapshots: GitHubProjectSnapshot[],
): {
  projects: ProjectDefinition[];
  snapshots: GitHubProjectSnapshot[];
} {
  const byRepo = new Map(snapshots.map((s) => [s.repository, s]));
  const projects = definitions.filter((definition) => {
    if (!definition.published) return false;
    const snapshot = byRepo.get(definition.repository);
    return !snapshot || snapshot.visibility === 'public';
  });
  const repositories = new Set(projects.map((p) => p.repository));
  return {
    projects,
    snapshots: snapshots.filter(
      (s) => s.visibility === 'public' && repositories.has(s.repository),
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
