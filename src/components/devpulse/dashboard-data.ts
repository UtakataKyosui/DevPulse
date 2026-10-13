import projectsJson from '../../data/devpulse/projects.sample.json';
import snapshotsJson from '../../data/devpulse/snapshots.sample.json';
import {
  buildProjectViews,
  type ProjectView,
  projectConfigSchema,
  snapshotFileSchema,
} from '../../lib/devpulse/index.ts';

/** rspress.config.ts の source.define でビルド時に 1 度だけ固定される(SSG とクライアントで同一値) */
declare const __DEVPULSE_BUILD_TIME__: string | undefined;

export function getBuildTime(): Date {
  return new Date(
    typeof __DEVPULSE_BUILD_TIME__ === 'string'
      ? __DEVPULSE_BUILD_TIME__
      : '1970-01-01T00:00:00Z',
  );
}

export function loadProjectViews(now: Date = getBuildTime()): ProjectView[] {
  const { projects } = projectConfigSchema.parse(projectsJson);
  const { snapshots } = snapshotFileSchema.parse(snapshotsJson);
  return buildProjectViews(projects, snapshots, { now });
}
