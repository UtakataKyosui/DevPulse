import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  assessDeadline,
  assessFreshness,
  assessHealth,
  buildProjectViews,
  calcIssueThroughput,
  type GitHubMilestoneSnapshot,
  type GitHubProjectSnapshot,
  type Lifecycle,
  type ProjectDefinition,
  type ProjectView,
} from '../../lib/devpulse/index.ts';
import {
  buildDashboardModel,
  formatJstDateTime,
  toCardModel,
} from './model.ts';
import { ProjectDashboard } from './ProjectDashboard.tsx';

const NOW = new Date('2026-10-13T03:00:00Z');

const milestone = (
  over: Partial<GitHubMilestoneSnapshot> = {},
): GitHubMilestoneSnapshot => ({
  number: 1,
  title: 'MVP',
  description: null,
  state: 'open',
  openIssues: 3,
  closedIssues: 17,
  dueOn: '2026-10-20T00:00:00Z',
  htmlUrl: 'https://github.com/o/r/milestone/1',
  ...over,
});

function make(opts: {
  lifecycle?: Lifecycle;
  lastActivityAt?: string | null;
  milestones?: GitHubMilestoneSnapshot[];
  featured?: number | undefined;
  snapshot?: boolean;
  fetchedAt?: string;
  slug?: string;
}) {
  const slug = opts.slug ?? 'p';
  const def: ProjectDefinition = {
    id: slug,
    slug,
    name: `Name ${slug}`,
    description: 'desc',
    repository: `o/${slug}`,
    published: true,
    lifecycle: opts.lifecycle ?? 'active',
    ...('featured' in opts
      ? opts.featured === undefined
        ? {}
        : { featuredMilestoneNumber: opts.featured }
      : { featuredMilestoneNumber: 1 }),
  };
  const snap: GitHubProjectSnapshot[] =
    opts.snapshot === false
      ? []
      : [
          {
            repository: def.repository,
            visibility: 'public',
            milestones: opts.milestones ?? [milestone()],
            lastActivityAt:
              'lastActivityAt' in opts
                ? (opts.lastActivityAt ?? null)
                : '2026-10-12T00:00:00Z',
            issueClosures: [],
            fetchedAt: opts.fetchedAt ?? '2026-10-13T00:00:00Z',
          },
        ];
  return { def, snap };
}

/**
 * buildProjectViews は公開状態を検証できない(snapshot なし)定義を出力しないため、
 * 表示モデルの防御的な空状態を確かめる目的で snapshot なしの View を直接組み立てる
 */
function viewWithoutSnapshot(def: ProjectDefinition): ProjectView {
  return {
    definition: def,
    snapshot: null,
    progressPercent: null,
    health: assessHealth({
      lifecycle: def.lifecycle,
      lastActivityAt: null,
      now: NOW,
    }),
    throughput: calcIssueThroughput([], NOW),
    deadline: assessDeadline(null, NOW),
    freshness: assessFreshness(null, NOW),
  };
}

function views(...cases: ReturnType<typeof make>[]) {
  return cases.map((c) =>
    c.snap.length === 0
      ? viewWithoutSnapshot(c.def)
      : buildProjectViews([c.def], c.snap, { now: NOW })[0],
  );
}

const card = (c: ReturnType<typeof make>) => toCardModel(views(c)[0]);

describe('表示モデル', () => {
  it('進捗85%とHealth赤(停滞)が共存する', () => {
    const c = card(
      make({
        lastActivityAt: '2026-10-07T00:00:00Z',
        milestones: [milestone({ openIssues: 3, closedIssues: 17 })],
      }),
    );
    expect(c.progress.percent).toBe(85);
    expect(c.progress.text).toBe('85%');
    expect(c.health.tone).toBe('stalled');
    expect(c.health.label).toBe('停滞');
    expect(c.progress.ariaLabel).toContain('85%');
    expect(c.progress.ariaLabel).toContain('Activity Health');
  });

  it('null進捗は「—」で0%/100%にならない', () => {
    const unset = card(make({ featured: undefined }));
    expect(unset.progress.percent).toBeNull();
    expect(unset.progress.text).toBe('—');
    expect(unset.progress.ariaLabel).not.toMatch(/\b(0|100)%/);
    expect(unset.emptyMessage).toContain('未設定');

    const empty = card(
      make({ milestones: [milestone({ openIssues: 0, closedIssues: 0 })] }),
    );
    expect(empty.progress.text).toBe('—');
    expect(empty.emptyMessage).toContain('Issue がありません');
  });

  it('0% と 100% は区別して表示される', () => {
    const zero = card(
      make({ milestones: [milestone({ openIssues: 5, closedIssues: 0 })] }),
    );
    const full = card(
      make({ milestones: [milestone({ openIssues: 0, closedIssues: 5 })] }),
    );
    expect(zero.progress.text).toBe('0%');
    expect(full.progress.text).toBe('100%');
  });

  it('割り切れない消化率は整数に丸めて表示する', () => {
    const third = card(
      make({ milestones: [milestone({ openIssues: 2, closedIssues: 1 })] }),
    );
    expect(third.progress.text).toBe('33%');
    expect(third.progress.ariaLabel).toContain('33%');
    expect(third.progress.ariaLabel).not.toContain('33.3');
  });

  it('100% 未満を丸めで 100% と表示しない', () => {
    const almost = card(
      make({ milestones: [milestone({ openIssues: 1, closedIssues: 999 })] }),
    );
    expect(almost.progress.text).toBe('99%');
  });

  it('activeで5日以上Commitが無ければ停滞', () => {
    expect(
      card(make({ lastActivityAt: '2026-10-08T00:00:00Z' })).health.tone,
    ).toBe('stalled');
    expect(
      card(make({ lastActivityAt: '2026-10-09T00:00:00Z' })).health.tone,
    ).toBe('warning');
  });

  it.each(['paused', 'completed', 'archived', 'planned'] as const)(
    '%s は赤にならず評価対象外',
    (lifecycle) => {
      const c = card(
        make({ lifecycle, lastActivityAt: '2026-01-01T00:00:00Z' }),
      );
      expect(c.health.tone).toBe('inactive');
      expect(c.health.evaluated).toBe(false);
      expect(c.health.label).toContain('評価対象外');
    },
  );

  it('Milestone未設定/該当なし/snapshotなしの空状態を区別する', () => {
    expect(card(make({ milestones: [] })).emptyMessage).toContain(
      '見つかりません',
    );
    expect(card(make({ snapshot: false })).emptyMessage).toContain(
      'データ未取得',
    );
    expect(card(make({ snapshot: false })).stale).toBe(true);
  });

  it('最終Commitと期限を表示する', () => {
    const c = card(make({ lastActivityAt: '2026-10-10T09:00:00Z' }));
    expect(c.lastCommitText).toBe('2026-10-10(3日前)');
    expect(c.deadline.text).toContain('2026-10-20');
    expect(card(make({ lastActivityAt: null })).lastCommitText).toBe('未取得');
  });

  it('詳細ページへのリンクを持つ', () => {
    expect(card(make({ slug: 'abc' })).href).toBe('/projects/abc/');
  });

  it('集計: 休止とその他を分け、停滞に混ぜない', () => {
    const { summary } = buildDashboardModel(
      views(
        make({ slug: 'a' }),
        make({ slug: 'b', lastActivityAt: '2026-10-09T00:00:00Z' }),
        make({ slug: 'c', lastActivityAt: '2026-10-01T00:00:00Z' }),
        make({
          slug: 'd',
          lifecycle: 'paused',
          lastActivityAt: '2026-01-01T00:00:00Z',
        }),
        make({ slug: 'e', lifecycle: 'completed' }),
        make({ slug: 'f', lastActivityAt: null }),
      ),
    );
    expect(summary).toEqual({
      total: 6,
      stable: 1,
      warning: 1,
      stalled: 1,
      paused: 1,
      unknown: 1,
      other: 1,
    });
  });

  it('同期: 最新時刻とstale件数。最終Commitとは別', () => {
    const { sync } = buildDashboardModel(
      views(
        make({ slug: 'a', fetchedAt: '2026-10-13T00:00:00Z' }),
        make({ slug: 'b', fetchedAt: '2026-10-01T00:00:00Z' }),
        make({ slug: 'c', snapshot: false }),
      ),
    );
    expect(sync.latestFetchedText).toBe('2026-10-13 09:00 JST');
    expect(sync.staleCount).toBe(2);
    expect(sync.stale).toBe(true);
  });

  it('formatJstDateTime は不正値で null', () => {
    expect(formatJstDateTime('x')).toBeNull();
    expect(formatJstDateTime(null)).toBeNull();
  });
});

describe('ProjectDashboard 描画', () => {
  it('設定ファイルの優先度順に表示し、同順位と未設定の順序を保つ', () => {
    const input = views(
      ...['a', 'b', 'c', 'd', 'e', 'f'].map((slug) => make({ slug })),
    );
    input[1].definition.priority = 'next';
    input[2].definition.priority = 'highest';
    input[3].definition.priority = 'next';
    input[4].definition.priority = 'later';
    input[5].definition.priority = 'unset';
    expect(buildDashboardModel(input).cards.map((card) => card.id)).toEqual([
      'c',
      'b',
      'd',
      'e',
      'a',
      'f',
    ]);
    expect(input.map((view) => view.definition.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
    const html = renderToString(<ProjectDashboard views={input} />);
    expect(html.indexOf('href="/projects/c/"')).toBeLessThan(
      html.indexOf('href="/projects/b/"'),
    );
    expect(html).toContain('最優先');
    expect(html).not.toContain('<select');
  });
  it('テキスト・リンク・aria-label・stale警告を出力する', () => {
    const html = renderToString(
      <ProjectDashboard
        views={views(
          make({ slug: 'a', lastActivityAt: '2026-10-07T00:00:00Z' }),
          make({ slug: 'b', snapshot: false }),
        )}
      />,
    );
    expect(html).toContain('href="/projects/a/"');
    expect(html).toContain('href="/projects/b/"');
    expect(html).toContain('Health: 停滞');
    expect(html).toContain('aria-label="Issue消化率 85%');
    expect(html).toContain('最終同期');
    expect(html).toContain('古い、または未取得');
    expect(html).toContain('—');
  });

  it('プロジェクトが0件なら空状態を表示する', () => {
    const html = renderToString(<ProjectDashboard views={[]} />);
    expect(html).toContain('公開対象のプロジェクトがありません');
    expect(html).toContain('未同期');
  });
});

describe('LoadNotice / loadState', () => {
  const { def, snap } = make({});
  const views = buildProjectViews([def], snap, { now: NOW });

  it('static では通知を出さない', () => {
    expect(renderToString(<ProjectDashboard views={views} />)).not.toContain(
      'devpulse-load',
    );
  });

  it('loading / error でも既存データのカードを表示し続ける', () => {
    const loading = renderToString(
      <ProjectDashboard views={views} loadState="loading" />,
    );
    expect(loading).toContain('取得しています');
    expect(loading).toContain('devpulse-cards');
    const error = renderToString(
      <ProjectDashboard views={views} loadState="error" />,
    );
    expect(error).toContain('取得できませんでした');
    expect(error).toContain('devpulse-cards');
  });
});
