import { Alert, AlertDescription } from '../ui/alert.tsx';
import type { LoadState } from './use-project-views.ts';

export function LoadNotice({ state }: { state: LoadState }) {
  if (state === 'loading') {
    return (
      <Alert className="mb-4" role="status">
        <AlertDescription>
          最新データを取得しています。取得できるまでビルド時点のデータを表示します。
        </AlertDescription>
      </Alert>
    );
  }
  if (state === 'error') {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertDescription>
          <span aria-hidden="true">⚠ </span>
          最新データを取得できませんでした。ビルド時点のデータを表示しています。
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}
