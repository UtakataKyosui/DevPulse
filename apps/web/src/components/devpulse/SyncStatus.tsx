import type { SyncModel } from './model.ts';

export function SyncStatus({ sync }: { sync: SyncModel }) {
  return (
    <div className="devpulse-sync">
      <p>
        最終同期: <strong>{sync.latestFetchedText ?? '未同期'}</strong>
        <span className="devpulse-sync__note">
          (データ取得時点です。閲覧時刻とは異なり、リアルタイム更新ではありません。最終Commitの日時とも別です)
        </span>
      </p>
      {sync.stale && (
        <p className="devpulse-sync__warning" role="status">
          <span aria-hidden="true">⚠ </span>
          {sync.staleCount}
          件のプロジェクトでデータが古い、または未取得です。表示内容が現状と異なる可能性があります。
        </p>
      )}
    </div>
  );
}
