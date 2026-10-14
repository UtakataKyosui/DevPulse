import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDashboardModel } from '../../components/devpulse/model.ts';
import { collectReportInput } from '../reports/model.ts';
import {
  assessDeadline,
  assessFreshness,
  assessHealth,
  buildProjectViews,
  calcElapsedDays,
  calcIssueThroughput,
  calcProgressPercent,
  jstCalendarDayDiff,
  normalizeIssueClosures,
  normalizeMilestones,
  projectConfigSchema,
  selectFeaturedMilestone,
  selectPublicData,
  snapshotFileSchema,
  sortProjectsByTier,
  toPublicView,
} from './index.ts';
import { buildProjectSidebar } from './project-sidebar.ts';
import type {
  GitHubMilestoneSnapshot,
  GitHubProjectSnapshot,
  Lifecycle,
  ProjectDefinition,
} from './types.ts';

const readJson = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../data/devpulse/${name}`, import.meta.url),
      'utf8',
    ),
  );

const config = projectConfigSchema.parse(readJson('projects.sample.json'));
const { snapshots } = snapshotFileSchema.parse(
  readJson('snapshots.sample.json'),
);
const NOW = new Date('2026-10-13T00:00:00Z');
const views = buildProjectViews(config.projects, snapshots, { now: NOW });
const view = (id: string) => views.find((v) => v.definition.id === id);

describe('sample data', () => {
  it('passes schema validation', () => {
    expect(config.projects.length).toBeGreaterThan(1);
    expect(snapshots.length).toBeGreaterThan(1);
  });

  it('rejects invalid config', () => {
    const base = config.projects[0];
    expect(
      projectConfigSchema.safeParse({
        projects: [{ ...base, lifecycle: 'unknown' }],
      }).success,
    ).toBe(false);
    expect(
      projectConfigSchema.safeParse({ projects: [base, base] }).success,
    ).toBe(false);
    expect(
      projectConfigSchema.safeParse({
        projects: [{ ...base, token: 'x' }],
      }).success,
    ).toBe(false);
  });

  it('accepts file priorities and rejects unsupported values', () => {
    const base = config.projects[0];
    for (const priority of ['highest', 'next', 'later', 'unset']) {
      expect(
        projectConfigSchema.parse({
          projects: [{ ...base, priority }],
        }).projects[0].priority,
      ).toBe(priority);
    }
    for (const priority of ['high', 1, null]) {
      expect(
        projectConfigSchema.safeParse({
          projects: [{ ...base, priority }],
        }).success,
      ).toBe(false);
    }
    expect(
      projectConfigSchema.parse({ projects: [base] }).projects[0].priority,
    ).toBeUndefined();
  });
});

describe('calcProgressPercent', () => {
  it('computes closed / (open + closed) * 100', () => {
    expect(calcProgressPercent({ openIssues: 6, closedIssues: 2 })).toBe(25);
  });
  it('returns null when there are no issues', () => {
    expect(calcProgressPercent({ openIssues: 0, closedIssues: 0 })).toBeNull();
  });
});

describe('selectFeaturedMilestone', () => {
  const snapshot = snapshots[0];
  it('returns null when featuredMilestoneNumber is unset', () => {
    expect(selectFeaturedMilestone({}, snapshot)).toBeNull();
  });
  it('returns null when the milestone does not exist', () => {
    expect(
      selectFeaturedMilestone({ featuredMilestoneNumber: 999 }, snapshot),
    ).toBeNull();
  });
  it('returns null when snapshot is null', () => {
    expect(
      selectFeaturedMilestone({ featuredMilestoneNumber: 1 }, null),
    ).toBeNull();
  });
});

describe('buildProjectViews', () => {
  it('computes progress from the featured milestone', () => {
    expect(view('devpulse')?.progressPercent).toBe(25);
  });
  it('gives null progress for zero issues', () => {
    expect(view('sample-empty')?.progressPercent).toBeNull();
  });
  it('gives null progress when no milestone is selected', () => {
    expect(view('sample-unselected')?.progressPercent).toBeNull();
  });
  it('does not fabricate progress for a missing milestone', () => {
    const definition: ProjectDefinition = {
      ...config.projects[0],
      featuredMilestoneNumber: 999,
    };
    const [v] = buildProjectViews([definition], snapshots, { now: NOW });
    expect(v.progressPercent).toBeNull();
  });
  it('keeps closed milestone progress independent of its state', () => {
    const v = view('sample-closed');
    expect(v?.progressPercent).toBe(75);
    expect(v?.snapshot?.milestones[0].state).toBe('closed');
  });
  it('excludes a published project whose visibility is unverified (no snapshot)', () => {
    expect(view('sample-unsynced')).toBeUndefined();
    const definition: ProjectDefinition = {
      ...config.projects[0],
      repository: 'example/unsynced',
    };
    expect(buildProjectViews([definition], [], { now: NOW })).toEqual([]);
  });
  it('matches repositories case-insensitively', () => {
    const definition: ProjectDefinition = {
      ...config.projects[0],
      repository: 'utakatakyosui/devpulse',
    };
    const [v] = buildProjectViews([definition], snapshots, { now: NOW });
    expect(v.progressPercent).toBe(25);
  });
  it('still excludes a private snapshot whose casing differs', () => {
    const definition: ProjectDefinition = {
      ...config.projects[0],
      repository: 'utakatakyosui/devpulse',
    };
    const priv: GitHubProjectSnapshot = {
      ...snapshots[0],
      visibility: 'private',
    };
    expect(buildProjectViews([definition], [priv], { now: NOW })).toEqual([]);
  });
  it('excludes published:false and private repositories', () => {
    expect(view('sample-draft')).toBeUndefined();
    expect(view('sample-private')).toBeUndefined();
    const json = JSON.stringify(views.map(toPublicView));
    expect(json).not.toContain('example/private');
    expect(json).not.toContain('secret-milestone');
    expect(json).not.toContain('example/draft');
  });
  it('excludes a private snapshot even if published', () => {
    const priv: GitHubProjectSnapshot = {
      ...snapshots[0],
      visibility: 'private',
    };
    expect(
      buildProjectViews(config.projects, [priv], { now: NOW }),
    ).not.toContainEqual(
      expect.objectContaining({
        definition: expect.objectContaining({ id: 'devpulse' }),
      }),
    );
  });
});

describe('selectPublicData', () => {
  const data = selectPublicData(config.projects, snapshots);

  it('未公開・private の定義と Snapshot を成果物用データから除く', () => {
    const ids = data.projects.map((p) => p.id);
    expect(ids).not.toContain('sample-draft');
    expect(ids).not.toContain('sample-private');
    expect(data.snapshots.map((s) => s.repository)).not.toContain(
      'example/private',
    );
    expect(data.snapshots.every((s) => s.visibility === 'public')).toBe(true);
  });

  it('シリアライズ結果に非公開の識別子を含めない', () => {
    const json = JSON.stringify(data);
    expect(json).not.toContain('example/private');
    expect(json).not.toContain('sample-draft');
    expect(json).not.toContain('secret-milestone');
  });

  it('公開対象の ProjectView は全件の結果と一致する', () => {
    expect(
      buildProjectViews(data.projects, data.snapshots, { now: NOW }),
    ).toEqual(views);
  });
});

describe('projectConfigSchema duplicates', () => {
  it('rejects repositories that differ only by case', () => {
    const [first] = config.projects;
    const result = projectConfigSchema.safeParse({
      projects: [
        first,
        {
          ...first,
          id: 'other',
          slug: 'other',
          repository: first.repository.toUpperCase(),
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('normalizeMilestones / secrets', () => {
  const raw = [
    {
      number: 1,
      title: 'MVP',
      description: null,
      state: 'open',
      open_issues: 1,
      closed_issues: 1,
      due_on: null,
      html_url: 'https://github.com/o/r/milestone/1',
      creator: { login: 'x' },
      token: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    },
  ];
  it('maps snake_case fields and drops unknown fields', () => {
    const [m] = normalizeMilestones(raw);
    expect(m).toEqual({
      number: 1,
      title: 'MVP',
      description: null,
      state: 'open',
      openIssues: 1,
      closedIssues: 1,
      dueOn: null,
      htmlUrl: 'https://github.com/o/r/milestone/1',
    });
    expect(JSON.stringify(m)).not.toContain('ghp_');
  });
  it('rejects malformed API responses', () => {
    expect(() => normalizeMilestones([{ number: 'a' }])).toThrow();
  });
  it('never puts token-like strings in public output or sample data', () => {
    const out = JSON.stringify(views.map(toPublicView));
    const files = ['projects.sample.json', 'snapshots.sample.json'].map((f) =>
      JSON.stringify(readJson(f)),
    );
    for (const text of [out, ...files]) {
      expect(text).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_/);
    }
  });
});

const at = (iso: string) => new Date(iso);

describe('jstCalendarDayDiff', () => {
  it('uses the Asia/Tokyo day boundary (UTC 15:00)', () => {
    const now = at('2026-10-13T00:00:00Z');
    expect(jstCalendarDayDiff('2026-10-12T14:59:59Z', now)).toBe(1);
    expect(jstCalendarDayDiff('2026-10-12T15:00:00Z', now)).toBe(0);
    expect(jstCalendarDayDiff('2026-10-11T14:59:59Z', now)).toBe(2);
    expect(
      jstCalendarDayDiff('2026-10-11T15:00:00Z', at('2026-10-12T14:59:59Z')),
    ).toBe(0);
    expect(
      jstCalendarDayDiff('2026-10-11T15:00:00Z', at('2026-10-12T15:00:00Z')),
    ).toBe(1);
  });
  it('returns null for invalid input', () => {
    expect(jstCalendarDayDiff('nope', at('2026-10-13T00:00:00Z'))).toBeNull();
  });
});

describe('assessHealth (active)', () => {
  const now = at('2026-10-13T03:00:00Z');
  const status = (days: number) =>
    assessHealth({
      lifecycle: 'active',
      lastActivityAt: new Date(now.getTime() - days * 86_400_000).toISOString(),
      now,
    });
  it.each([
    [0, 'stable'],
    [1, 'stable'],
    [2, 'stable'],
    [3, 'warning'],
    [4, 'warning'],
    [5, 'stalled'],
    [30, 'stalled'],
  ])('%i days -> %s', (days, expected) => {
    const result = status(days);
    expect(result.status).toBe(expected);
    expect(result.elapsedDays).toBe(days);
    expect(result.evaluated).toBe(true);
  });
  it('is unknown without a commit', () => {
    expect(
      assessHealth({ lifecycle: 'active', lastActivityAt: null, now }).status,
    ).toBe('unknown');
  });
  it('is unknown for future or invalid dates', () => {
    expect(calcElapsedDays('2026-10-20T00:00:00Z', now)).toBeNull();
    expect(calcElapsedDays('garbage', now)).toBeNull();
  });
  it('counts calendar days, not elapsed hours', () => {
    const result = assessHealth({
      lifecycle: 'active',
      lastActivityAt: '2026-10-10T14:59:59Z',
      now: at('2026-10-12T15:00:00Z'),
    });
    expect(result.elapsedDays).toBe(3);
    expect(result.status).toBe('warning');
  });
});

describe('assessHealth (lifecycle)', () => {
  it.each([
    ['paused', '休止中'],
    ['completed', '完了'],
    ['archived', 'アーカイブ'],
    ['planned', '計画中'],
  ] satisfies [Lifecycle, string][])(
    '%s is not evaluated',
    (lifecycle, label) => {
      const result = assessHealth({
        lifecycle,
        lastActivityAt: '2026-01-01T00:00:00Z',
        now: at('2026-10-13T00:00:00Z'),
      });
      expect(result).toMatchObject({
        evaluated: false,
        status: 'unknown',
        label,
      });
      expect(result.status).not.toBe('stalled');
    },
  );
});

describe('calcIssueThroughput', () => {
  const now = at('2026-10-13T03:00:00Z');
  const closure = (
    number: number,
    closedAt: string,
    isPullRequest = false,
  ) => ({
    number,
    closedAt,
    isPullRequest,
  });
  it('returns 7 JST days oldest first, including zero-count days', () => {
    const t = calcIssueThroughput([], now);
    expect(t.days).toHaveLength(7);
    expect(t.days[0].date).toBe('2026-10-07');
    expect(t.days[6].date).toBe('2026-10-13');
    expect(t.days.every((d) => !d.closed && d.count === 0)).toBe(true);
    expect(t.totalClosed).toBe(0);
    expect(t.closedDays).toBe(0);
  });
  it('splits days at JST midnight (UTC 15:00)', () => {
    const t = calcIssueThroughput(
      [
        closure(1, '2026-10-12T14:59:59Z'),
        closure(2, '2026-10-12T15:00:00Z'),
        closure(3, '2026-10-12T15:00:01Z'),
      ],
      now,
    );
    const byDate = Object.fromEntries(t.days.map((d) => [d.date, d.count]));
    expect(byDate['2026-10-12']).toBe(1);
    expect(byDate['2026-10-13']).toBe(2);
    expect(t.totalClosed).toBe(3);
    expect(t.closedDays).toBe(2);
  });
  it('excludes pull requests and out-of-window closures', () => {
    const t = calcIssueThroughput(
      [
        closure(1, '2026-10-12T00:00:00Z', true),
        closure(2, '2026-10-06T00:00:00Z'),
        closure(3, '2026-10-07T00:00:00Z'),
      ],
      now,
    );
    expect(t.totalClosed).toBe(1);
    expect(t.closedDays).toBe(1);
  });
  it('is independent of Activity Health', () => {
    const [v] = buildProjectViews(
      [{ ...config.projects[0], lifecycle: 'active' }],
      [
        {
          ...snapshots[0],
          lastActivityAt: null,
          issueClosures: [closure(1, '2026-10-12T05:00:00Z')],
        },
      ],
      { now: NOW },
    );
    expect(v.health.status).toBe('unknown');
    expect(v.throughput.closedDays).toBe(1);
  });
  it('normalizes issues API output, keeping PRs distinguishable', () => {
    expect(
      normalizeIssueClosures([
        { number: 1, closed_at: '2026-10-12T05:00:00Z' },
        { number: 2, closed_at: '2026-10-12T05:00:00Z', pull_request: {} },
        { number: 3, closed_at: null },
      ]),
    ).toEqual([
      { number: 1, closedAt: '2026-10-12T05:00:00Z', isPullRequest: false },
      { number: 2, closedAt: '2026-10-12T05:00:00Z', isPullRequest: true },
    ]);
  });
});

describe('assessDeadline', () => {
  const now = at('2026-10-13T03:00:00Z');
  const ms = (
    dueOn: string | null,
    extra: Partial<GitHubMilestoneSnapshot> = {},
  ) => ({
    state: 'open' as const,
    dueOn,
    openIssues: 2,
    closedIssues: 1,
    ...extra,
  });
  it('none without milestone or due date', () => {
    expect(assessDeadline(null, now).status).toBe('none');
    expect(assessDeadline(ms(null), now).status).toBe('none');
  });
  it('on_track / due_soon / overdue with boundaries', () => {
    expect(assessDeadline(ms('2026-10-21T00:00:00Z'), now)).toEqual({
      status: 'on_track',
      daysUntilDue: 8,
    });
    expect(assessDeadline(ms('2026-10-20T00:00:00Z'), now)).toEqual({
      status: 'due_soon',
      daysUntilDue: 7,
    });
    expect(assessDeadline(ms('2026-10-13T00:00:00Z'), now)).toEqual({
      status: 'due_soon',
      daysUntilDue: 0,
    });
    expect(assessDeadline(ms('2026-10-12T00:00:00Z'), now)).toEqual({
      status: 'overdue',
      daysUntilDue: -1,
    });
  });
  it('threshold is configurable', () => {
    expect(assessDeadline(ms('2026-10-20T00:00:00Z'), now, 3).status).toBe(
      'on_track',
    );
  });
  it('completed wins over overdue', () => {
    expect(
      assessDeadline(ms('2026-10-01T00:00:00Z', { state: 'closed' }), now)
        .status,
    ).toBe('completed');
    expect(
      assessDeadline(ms('2026-10-01T00:00:00Z', { openIssues: 0 }), now).status,
    ).toBe('completed');
  });
  it('empty milestone is not completed', () => {
    expect(
      assessDeadline(ms(null, { openIssues: 0, closedIssues: 0 }), now).status,
    ).toBe('none');
  });
  it('does not affect health', () => {
    const v = view('sample-closed');
    expect(v?.deadline.status).toBe('completed');
    expect(v?.health.status).toBe('unknown');
  });
});

describe('assessFreshness', () => {
  const now = at('2026-10-13T00:00:00Z');
  it('is fresh within the threshold', () => {
    expect(assessFreshness('2026-10-12T00:00:00Z', now)).toEqual({
      fetchedAt: '2026-10-12T00:00:00Z',
      ageHours: 24,
      stale: false,
    });
  });
  it('is stale beyond a configurable threshold', () => {
    expect(assessFreshness('2026-10-12T00:00:00Z', now, 12).stale).toBe(true);
    expect(assessFreshness('2026-10-10T00:00:00Z', now).stale).toBe(true);
  });
  it('is stale when missing or invalid', () => {
    expect(assessFreshness(null, now).stale).toBe(true);
    expect(assessFreshness('x', now).ageHours).toBeNull();
  });
});

describe('ProjectView independence', () => {
  it('keeps progress, health, and deadline separate', () => {
    const v = view('devpulse');
    expect(v?.progressPercent).toBe(25);
    expect(v?.health).toMatchObject({ status: 'warning', elapsedDays: 3 });
    expect(v?.deadline.status).toBe('on_track');
    expect(v?.throughput.totalClosed).toBe(1);
    expect(v?.freshness.stale).toBe(false);
  });
  it('yields null progress for an empty milestone with deadline none', () => {
    const v = view('sample-empty');
    expect(v?.progressPercent).toBeNull();
    expect(v?.health.label).toBe('計画中');
  });
});

describe('Tier による表示順', () => {
  const tiers = ['low', 'medium', 'high', 'medium', 'high', 'low'] as const;
  const definitions: ProjectDefinition[] = tiers.map((tier, index) => ({
    id: `p${index}`,
    slug: `p${index}`,
    name: `P${index}`,
    description: '',
    repository: `o/p${index}`,
    published: true,
    lifecycle: 'active',
    tier,
  }));
  const tierSnapshots: GitHubProjectSnapshot[] = definitions.map((d) => ({
    repository: d.repository,
    visibility: 'public',
    milestones: [],
    lastActivityAt: '2026-10-12T00:00:00Z',
    issueClosures: [],
    fetchedAt: '2026-10-12T12:00:00Z',
  }));
  // Tier(high → medium → low)、同 Tier は配列内の順序
  const expected = ['p2', 'p4', 'p1', 'p3', 'p0', 'p5'];

  it('sortProjectsByTier は入力を変更せず安定に並べる', () => {
    const input = [...definitions];
    expect(sortProjectsByTier(input, (d) => d.tier).map((d) => d.id)).toEqual(
      expected,
    );
    expect(input).toEqual(definitions);
  });

  it('Home・サイドバー・日次レポートの並びが一致する', () => {
    const projectViews = buildProjectViews(definitions, tierSnapshots, {
      now: NOW,
    });
    const home = buildDashboardModel(projectViews).cards.map((c) => c.id);
    const sidebar = buildProjectSidebar(definitions).flatMap((group) =>
      group.items.map((item) => item.link.split('/')[2]),
    );
    const report = collectReportInput(
      '2026-10-12',
      definitions,
      tierSnapshots,
      null,
      NOW,
    ).projects.map((p) => p.name.toLowerCase());
    expect(home).toEqual(expected);
    expect(sidebar).toEqual(expected);
    expect(report).toEqual(expected);
  });

  it('不正な tier と tier 欠落を拒否する', () => {
    const base = config.projects[0];
    expect(
      projectConfigSchema.safeParse({ projects: [{ ...base, tier: 'top' }] })
        .success,
    ).toBe(false);
    const { tier: _tier, ...withoutTier } = base;
    expect(
      projectConfigSchema.safeParse({ projects: [withoutTier] }).success,
    ).toBe(false);
  });
});
