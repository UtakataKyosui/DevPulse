import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import projects from '../../data/devpulse/projects.sample.json';
import snapshots from '../../data/devpulse/snapshots.sample.json';
import {
  buildProjectViews,
  projectConfigSchema,
  snapshotFileSchema,
} from '../../lib/devpulse/index.ts';
import { describeProgress } from './model.ts';
import { ProgressGauge } from './ProgressGauge.tsx';
import {
  IssueThroughput,
  MilestoneList,
  ProjectDetail,
  RecentActivity,
} from './ProjectDetail.tsx';

vi.mock('./use-project-views.ts', () => ({
  useProjectViews: () => ({
    views: buildProjectViews(
      projectConfigSchema.parse(projects).projects,
      snapshotFileSchema.parse(snapshots).snapshots,
      { now: new Date('2026-10-13T03:00:00Z') },
    ),
    state: 'static',
  }),
}));

describe('shadcn progress and detail UI', () => {
  it('exposes measured progress and distinguishes missing data from zero', () => {
    const measured = renderToString(
      <ProgressGauge progress={describeProgress(50, '安定')} tone="stable" />,
    );
    const missing = renderToString(
      <ProgressGauge
        progress={describeProgress(null, '不明')}
        tone="unknown"
      />,
    );
    expect(measured).toContain('aria-valuenow="50"');
    expect(missing).not.toContain('aria-valuenow');
    expect(missing).toContain('aria-valuetext="—"');
  });

  it('renders milestone and activity tables with a chart and readable daily data during SSG', () => {
    const html = renderToString(
      <ProjectDetail slug="devpulse">
        <MilestoneList />
        <IssueThroughput />
        <RecentActivity />
      </ProjectDetail>,
    );
    expect(html).toContain('aria-label="Milestone 一覧"');
    expect(html).toContain('aria-label="最近の活動"');
    expect(html).toContain('data-slot="chart"');
    expect(html).toContain('日別の件数');
    expect(html).toContain('Close 件数');
  });
});
