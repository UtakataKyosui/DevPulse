import type { ProjectDefinition } from './types.ts';

const GROUPS = [
  ['active', 'In Progress（開発中）'],
  ['planned', 'Planned（計画中）'],
  ['paused', 'Is Pending（休止中）'],
  ['completed', 'Complete（完了）'],
  ['archived', 'Archived（アーカイブ）'],
] as const;

/** _meta.json の形式を使い、Guide の自動ナビゲーションも維持する。 */
export function buildProjectSidebar(projects: ProjectDefinition[]) {
  return GROUPS.flatMap(([lifecycle, label]) => {
    const items = projects
      .filter((project) => project.published && project.lifecycle === lifecycle)
      .map((project) => ({
        label: project.name,
        link: `/projects/${project.slug}/`,
      }));
    return items.length
      ? [
          {
            type: 'custom-link' as const,
            label,
            collapsible: true,
            collapsed: false,
            items,
          },
        ]
      : [];
  });
}
