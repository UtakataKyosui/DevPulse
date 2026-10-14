import type {
  GitHubProjectSnapshot,
  Lifecycle,
  ProjectDefinition,
  Tier,
} from '@devpulse/domain/devpulse/types';

export const TIERS: Tier[] = ['high', 'medium', 'low'];
export const TIER_LABEL: Record<Tier, string> = {
  high: '高 (high)',
  medium: '中 (medium)',
  low: '低 (low)',
};
export const LIFECYCLES: Lifecycle[] = [
  'planned',
  'active',
  'paused',
  'completed',
  'archived',
];

const FIELD_LABEL: Record<string, string> = {
  name: '名前',
  description: '説明',
  lifecycle: 'ライフサイクル',
  tier: 'Tier',
  published: '公開',
  featuredMilestoneNumber: '代表 Milestone',
  repository: 'リポジトリ',
  slug: 'slug',
  id: 'id',
  priority: '着手優先度',
};

export interface FieldIssue {
  path: string;
  message: string;
}

export interface HistoryEntry {
  revision: number;
  updatedAt: string;
  updatedBy: string;
  projectCount: number;
}

export interface Candidate {
  repository: string;
  description: string;
  defaults: ProjectDefinition;
}

export type Snapshots = Record<string, GitHubProjectSnapshot>;

/** プロジェクトの同一性。リポジトリは画面から変更できず、slug の編集中も変わらない。 */
export const projectKey = (p: ProjectDefinition) => p.repository.toLowerCase();

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function show(v: unknown) {
  return v === undefined ? '(なし)' : JSON.stringify(v);
}

/** Tier を変えて、移動先 Tier の末尾に置く。 */
export function moveToTier(
  projects: ProjectDefinition[],
  target: ProjectDefinition,
  tier: Tier,
): ProjectDefinition[] {
  return [...projects.filter((p) => p !== target), { ...target, tier }];
}

/** 同じ Tier 内で 1 つ上(-1)または下(+1)の隣と入れ替える。 */
export function moveWithinTier(
  projects: ProjectDefinition[],
  target: ProjectDefinition,
  delta: -1 | 1,
): ProjectDefinition[] {
  const peers = projects.filter((p) => p.tier === target.tier);
  const other = peers[peers.indexOf(target) + delta];
  if (!other) return projects;
  const a = projects.indexOf(target);
  const b = projects.indexOf(other);
  const next = [...projects];
  next[a] = other;
  next[b] = target;
  return next;
}

/** ドラッグした項目を同じ Tier の対象の直前へ移す。 */
export function dropBefore(
  projects: ProjectDefinition[],
  dragged: ProjectDefinition,
  target: ProjectDefinition,
): ProjectDefinition[] {
  if (dragged === target || dragged.tier !== target.tier) return projects;
  const rest = projects.filter((p) => p !== dragged);
  rest.splice(rest.indexOf(target), 0, dragged);
  return rest;
}

function tierOrder(list: ProjectDefinition[]) {
  return Object.fromEntries(
    TIERS.map((t) => [t, list.filter((p) => p.tier === t).map((p) => p.id)]),
  ) as Record<Tier, string[]>;
}

/** 保存・復元前に利用者へ見せる変更点の一覧。 */
export function diffLines(
  original: ProjectDefinition[],
  projects: ProjectDefinition[],
): string[] {
  const lines: string[] = [];
  const before = new Map(original.map((p) => [p.id, p]));
  const now = new Map(projects.map((p) => [p.id, p]));

  for (const p of projects) {
    const b = before.get(p.id);
    if (!b) {
      lines.push(`追加: ${p.name} (${p.repository})`);
      continue;
    }
    const keys = new Set([...Object.keys(b), ...Object.keys(p)]);
    for (const k of keys) {
      const was = (b as unknown as Record<string, unknown>)[k];
      const is = (p as unknown as Record<string, unknown>)[k];
      if (!same(was, is))
        lines.push(
          `変更: ${p.name} / ${FIELD_LABEL[k] ?? k}: ${show(was)} -> ${show(is)}`,
        );
    }
  }
  for (const b of original) {
    if (!now.has(b.id)) lines.push(`削除: ${b.name} (${b.repository})`);
  }

  const o1 = tierOrder(original.filter((p) => now.has(p.id)));
  const o2 = tierOrder(projects.filter((p) => before.has(p.id)));
  for (const t of TIERS) {
    const unchangedTier = (id: string) =>
      before.get(id)?.tier === now.get(id)?.tier;
    const a = o1[t].filter(unchangedTier);
    const b = o2[t].filter(unchangedTier);
    if (!same(a, b))
      lines.push(
        `並び替え: ${t} Tier の順序が変わります (${b.map((id) => now.get(id)?.name).join(' > ')})`,
      );
  }
  return lines;
}

/** 422 の検証エラーを、プロジェクトごとの項目エラーと全体エラーに振り分ける。 */
export function splitIssues(
  issues: FieldIssue[],
  projects: ProjectDefinition[],
) {
  const byProject: Record<string, { field: string; message: string }[]> = {};
  const general: string[] = [];
  for (const e of issues) {
    const m = /^projects\.(\d+)\.?(.*)$/.exec(e.path);
    const project = m ? projects[Number(m[1])] : undefined;
    if (m && project) {
      const key = projectKey(project);
      byProject[key] = [
        ...(byProject[key] ?? []),
        { field: m[2] ?? '', message: e.message },
      ];
    } else general.push(`${e.path}: ${e.message}`);
  }
  return { byProject, general };
}

export function formatTime(iso: string | null | undefined) {
  if (!iso) return '未同期';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '未同期' : d.toLocaleString('ja-JP');
}

/** 追加候補の既定値から、slug / id が既存と重ならない新規プロジェクトを作る。 */
export function newProjectFrom(
  candidate: Candidate,
  projects: ProjectDefinition[],
): ProjectDefinition {
  const taken = new Set(projects.flatMap((p) => [p.id, p.slug]));
  const d = { ...candidate.defaults };
  const base = d.slug;
  for (let n = 2; taken.has(d.slug) || taken.has(d.id); n++) {
    d.slug = `${base}-${n}`;
    d.id = d.slug;
  }
  return d;
}
