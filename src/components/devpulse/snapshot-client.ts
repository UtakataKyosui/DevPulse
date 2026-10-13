import {
  type GitHubProjectSnapshot,
  snapshotFileSchema,
} from '../../lib/devpulse/index.ts';

/** rspress.config.ts が DEVPULSE_API_URL から埋め込む。未設定ならビルド同梱の fixture のみで表示する */
declare const __DEVPULSE_API_URL__: string | undefined;

export function getApiBaseUrl(): string | null {
  return typeof __DEVPULSE_API_URL__ === 'string' && __DEVPULSE_API_URL__
    ? __DEVPULSE_API_URL__.replace(/\/+$/, '')
    : null;
}

/** Worker の読み取り専用 API(`GET {base}/snapshots`)から公開 Snapshot を取得して検証する */
export async function fetchSnapshots(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<GitHubProjectSnapshot[]> {
  const response = await fetch(`${baseUrl}/snapshots`, {
    signal,
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Snapshot API: HTTP ${response.status}`);
  return snapshotFileSchema.parse(await response.json()).snapshots;
}
