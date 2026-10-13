import {
  buildProjectViews,
  type GitHubProjectSnapshot,
  type ProjectDefinition,
  type ProjectView,
} from '../../lib/devpulse/index.ts';

/** rspress.config.ts の source.define でビルド時に 1 度だけ固定される(SSG とクライアントで同一値) */
declare const __DEVPULSE_BUILD_TIME__: string | undefined;
/** rspress.config.ts が公開対象だけに絞って埋め込む(非公開データは成果物に含めない) */
declare const __DEVPULSE_PUBLIC_DATA__:
  | { projects: ProjectDefinition[]; snapshots: GitHubProjectSnapshot[] }
  | undefined;

export function getBuildTime(): Date {
  return new Date(
    typeof __DEVPULSE_BUILD_TIME__ === 'string'
      ? __DEVPULSE_BUILD_TIME__
      : '1970-01-01T00:00:00Z',
  );
}

export function loadProjectViews(now: Date = getBuildTime()): ProjectView[] {
  const { projects, snapshots } =
    typeof __DEVPULSE_PUBLIC_DATA__ === 'undefined'
      ? { projects: [], snapshots: [] }
      : __DEVPULSE_PUBLIC_DATA__;
  return buildProjectViews(projects, snapshots, { now });
}
