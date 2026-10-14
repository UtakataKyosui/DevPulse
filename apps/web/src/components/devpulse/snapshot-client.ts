import {
  type GitHubProjectSnapshot,
  type ProjectDefinition,
  projectConfigSchema,
  snapshotFileSchema,
} from '@devpulse/domain';

/** rspress.config.ts が DEVPULSE_API_URL から埋め込む。未設定なら API を呼ばず何も表示しない */
declare const __DEVPULSE_API_URL__: string | undefined;

export function getApiBaseUrl(): string | null {
  return typeof __DEVPULSE_API_URL__ === 'string' && __DEVPULSE_API_URL__
    ? __DEVPULSE_API_URL__.replace(/\/+$/, '')
    : null;
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

/** Worker の読み取り専用 API(`GET {base}/snapshots`)から公開 Snapshot を取得して検証する */
export async function fetchSnapshots(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<GitHubProjectSnapshot[]> {
  return snapshotFileSchema.parse(await getJson(`${baseUrl}/snapshots`, signal))
    .snapshots;
}

/** 公開プロジェクトの定義(`GET {base}/projects`)を表示順のまま取得して検証する */
export async function fetchProjects(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<ProjectDefinition[]> {
  return projectConfigSchema.parse(await getJson(`${baseUrl}/projects`, signal))
    .projects;
}
