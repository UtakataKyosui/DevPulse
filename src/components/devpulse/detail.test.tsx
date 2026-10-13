import { existsSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import projectsJson from '../../data/devpulse/projects.sample.json';
import snapshotsJson from '../../data/devpulse/snapshots.sample.json';
import {
  buildProjectViews,
  type ProjectView,
  projectConfigSchema,
  snapshotFileSchema,
} from '../../lib/devpulse/index.ts';
import { buildDetailModel } from './detail-model.ts';
import { toCardModel } from './model.ts';
import {
  MilestoneList,
  NextActions,
  ProjectDetail,
  ProjectStatus,
} from './ProjectDetail.tsx';

const NOW = new Date('2026-10-13T03:00:00Z');
const views: ProjectView[] = buildProjectViews(
  projectConfigSchema.parse(projectsJson).projects,
  snapshotFileSchema.parse(snapshotsJson).snapshots,
  { now: NOW },
);
const byslug = (slug: string) => {
  const view = views.find((v) => v.definition.slug === slug);
  if (!view) throw new Error(`no view: ${slug}`);
  return view;
};

describe('buildDetailModel', () => {
  it('Home と同じ表示モデルを再計算せずに使う', () => {
    for (const view of views) {
      expect(buildDetailModel(view).card).toEqual(toCardModel(view));
    }
  });

  it('Milestone 0 件・未設定でも GitHub への導線を返す', () => {
    const unselected = buildDetailModel(byslug('sample-unselected'));
    expect(unselected.nextActions.title).toBeNull();
    expect(unselected.nextActions.href).toContain('/issues');
  });

  it('PR を最近の Close に含めない', () => {
    const model = buildDetailModel(byslug('devpulse'));
    expect(model.recentClosures.map((c) => c.number)).not.toContain(9);
  });
});

describe('ProjectDetail', () => {
  it('公開対象の slug には静的ページがある', () => {
    for (const view of views) {
      expect(
        existsSync(`docs/projects/${view.definition.slug}/index.mdx`),
        view.definition.slug,
      ).toBe(true);
    }
  });

  it('未知の slug でも壊れず、説明文章(children)を表示する', () => {
    const html = renderToString(
      <ProjectDetail slug="unknown">
        <p>静的な説明</p>
        <ProjectStatus />
        <MilestoneList />
        <NextActions />
      </ProjectDetail>,
    );
    expect(html).toContain('静的な説明');
    expect(html).toContain('進捗データを表示できません');
  });
});
