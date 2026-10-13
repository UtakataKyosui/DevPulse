import type { LoadState } from './use-project-views.ts';

export function LoadNotice({ state }: { state: LoadState }) {
  if (state === 'loading') {
    return (
      <p className="devpulse-load devpulse-load--loading" role="status">
        最新データを取得しています。取得できるまでビルド時点のデータを表示します。
      </p>
    );
  }
  if (state === 'error') {
    return (
      <p className="devpulse-load devpulse-load--error" role="alert">
        <span aria-hidden="true">⚠ </span>
        最新データを取得できませんでした。ビルド時点のデータを表示しています。
      </p>
    );
  }
  return null;
}
