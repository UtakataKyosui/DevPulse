import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildProjectViews,
  calcProgressPercent,
  normalizeMilestones,
  projectConfigSchema,
  selectFeaturedMilestone,
  snapshotFileSchema,
  toPublicView,
} from './index.ts';
import type { GitHubProjectSnapshot, ProjectDefinition } from './types.ts';

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
const views = buildProjectViews(config.projects, snapshots);
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
    const [v] = buildProjectViews([definition], snapshots);
    expect(v.progressPercent).toBeNull();
  });
  it('keeps closed milestone progress independent of its state', () => {
    const v = view('sample-closed');
    expect(v?.progressPercent).toBe(75);
    expect(v?.snapshot?.milestones[0].state).toBe('closed');
  });
  it('yields null progress and unknown health when snapshot is missing', () => {
    const v = view('sample-unsynced');
    expect(v).toBeDefined();
    expect(v?.snapshot).toBeNull();
    expect(v?.progressPercent).toBeNull();
    expect(v?.health).toBe('unknown');
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
    expect(buildProjectViews(config.projects, [priv])).not.toContainEqual(
      expect.objectContaining({
        definition: expect.objectContaining({ id: 'devpulse' }),
      }),
    );
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
