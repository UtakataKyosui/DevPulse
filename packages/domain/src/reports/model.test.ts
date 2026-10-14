import type {
  GitHubProjectSnapshot,
  ProjectDefinition,
} from '@devpulse/domain/devpulse/types';
import {
  collectReportInput,
  escapeMarkdown,
  previousReportDate,
  type Report,
  renderReport,
  reportDateSchema,
} from '@devpulse/domain/reports/model';
import { describe, expect, it } from 'vitest';

const definition: ProjectDefinition = {
  id: 'a',
  slug: 'a',
  name: 'Example',
  description: '',
  repository: 'owner/repo',
  published: true,
  lifecycle: 'active',
  tier: 'medium',
  featuredMilestoneNumber: 1,
};
const snapshot: GitHubProjectSnapshot = {
  repository: 'owner/repo',
  visibility: 'public',
  fetchedAt: '2026-10-14T00:00:00Z',
  lastActivityAt: '2026-10-13T00:00:00Z',
  milestones: [
    {
      number: 1,
      title: 'MVP',
      description: null,
      state: 'open',
      openIssues: 1,
      closedIssues: 1,
      dueOn: null,
      htmlUrl: 'https://github.com/owner/repo/milestone/1',
    },
  ],
  issueClosures: [
    { number: 1, closedAt: '2026-10-12T14:59:59Z', isPullRequest: false },
    { number: 2, closedAt: '2026-10-12T15:00:00Z', isPullRequest: false },
    { number: 3, closedAt: '2026-10-13T14:59:59Z', isPullRequest: false },
    { number: 4, closedAt: '2026-10-13T15:00:00Z', isPullRequest: false },
    { number: 5, closedAt: '2026-10-13T00:00:00Z', isPullRequest: true },
  ],
};

describe('daily report facts', () => {
  it('uses the previous JST calendar day and half-open bounds, excluding PRs', () => {
    expect(previousReportDate(new Date('2026-10-13T15:00:00Z'))).toBe(
      '2026-10-13',
    );
    const input = collectReportInput(
      '2026-10-13',
      [definition],
      [snapshot],
      null,
      new Date('2026-10-14T00:00:00Z'),
    );
    expect(input.projects[0].closedIssues).toBe(2);
    expect(input.projects[0].progressDelta).toBeNull();
    expect(input.start).toBe('2026-10-12T15:00:00.000Z');
    expect(input.end).toBe('2026-10-13T15:00:00.000Z');
    expect(reportDateSchema.safeParse('2026-02-30').success).toBe(false);
  });

  it('compares only consecutive, fresh captures of the same milestone', () => {
    const previous = collectReportInput(
      '2026-10-12',
      [definition],
      [snapshot],
      null,
      new Date('2026-10-14T00:00:00Z'),
    );
    previous.projects[0].progress = 25;
    const input = collectReportInput(
      '2026-10-13',
      [definition],
      [snapshot],
      previous,
      new Date('2026-10-14T00:00:00Z'),
    );
    expect(input.projects[0].progressDelta).toBe(25);
    previous.projects[0].milestoneNumber = 2;
    expect(
      collectReportInput(
        '2026-10-13',
        [definition],
        [snapshot],
        previous,
        new Date('2026-10-14T00:00:00Z'),
      ).projects[0].progressDelta,
    ).toBeNull();
    previous.projects[0].milestoneNumber = 1;
    previous.projects[0].stale = true;
    expect(
      collectReportInput(
        '2026-10-13',
        [definition],
        [snapshot],
        previous,
        new Date('2026-10-14T00:00:00Z'),
      ).projects[0].progressDelta,
    ).toBeNull();
  });

  it('omits private, unpublished and expired data; marks retained failed-sync data stale', () => {
    const input = collectReportInput(
      '2026-10-13',
      [definition, { ...definition, published: false }],
      [{ ...snapshot, fetchedAt: '2026-10-13T20:00:00Z' }],
      null,
      new Date('2026-10-14T00:00:00Z'),
    );
    expect(input.projects).toHaveLength(1);
    expect(input.projects[0].stale).toBe(true);
    const hidden = collectReportInput(
      '2026-10-13',
      [definition],
      [{ ...snapshot, visibility: 'private' }],
      null,
      new Date('2026-10-14T00:00:00Z'),
    );
    expect(hidden.projects).toEqual([]);
    expect(hidden.missingProjects).toBe(1);
    expect(JSON.stringify(hidden)).not.toContain('owner/repo');
    expect(
      collectReportInput(
        '2026-10-13',
        [definition],
        [snapshot],
        null,
        new Date('2026-10-16T00:00:00Z'),
      ).projects,
    ).toEqual([]);
  });

  it('renders AI and labels as text while preserving fixed publication metadata', () => {
    const report: Report = {
      input: collectReportInput(
        '2026-10-13',
        [definition],
        [snapshot],
        null,
        new Date('2026-10-14T00:00:00Z'),
      ),
      summary:
        '<script>alert(1)</script>\n{process.env.SECRET}\n![bad](javascript:alert(1))',
      publishedAt: '2026-10-14T00:00:00.000Z',
      model: 'example',
      promptVersion: 1,
    };
    const markdown = renderReport(report);
    expect(markdown).not.toContain('<script>');
    expect(markdown).not.toContain('{process.env');
    expect(markdown).not.toContain('![bad]');
    expect(escapeMarkdown('<')).toBe('&#60;');
    expect(markdown).toContain('published_at: "2026-10-14T00:00:00.000Z"');
    expect(markdown).toContain('Issue クローズ: 2 件');
  });
});
