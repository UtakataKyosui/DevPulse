import { Alert, AlertDescription } from '@devpulse/ui/alert';
import type { LoadState } from './use-project-views.ts';

export function LoadNotice({ state }: { state: LoadState }) {
  if (state === 'loading') {
    return (
      <Alert className="mb-4" role="status">
        <AlertDescription>最新データを取得しています。</AlertDescription>
      </Alert>
    );
  }
  if (state === 'error') {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertDescription>
          <span aria-hidden="true">⚠ </span>
          最新データを取得できませんでした。
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}
