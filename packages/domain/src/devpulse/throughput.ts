import { shiftJstDate, toJstDate } from '@devpulse/domain/devpulse/jst';
import type {
  IssueClosure,
  IssueThroughput,
} from '@devpulse/domain/devpulse/types';

export const THROUGHPUT_WINDOW_DAYS = 7;

/**
 * closed_at を JST 日付で集計する。Pull Request は除外。
 * now の JST 暦日を含む直近 windowDays 日を古い順に返し、0 件の日も含める。
 * closed_at ベースのスナップショット集計であり、再オープン前の Close は復元しない。
 */
export function calcIssueThroughput(
  closures: IssueClosure[],
  now: Date,
  windowDays: number = THROUGHPUT_WINDOW_DAYS,
): IssueThroughput {
  const counts = new Map<string, number>();
  for (const closure of closures) {
    if (closure.isPullRequest) continue;
    const date = toJstDate(closure.closedAt);
    if (date) counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  const today = toJstDate(now);
  const days: IssueThroughput['days'] = [];
  if (today) {
    for (let i = windowDays - 1; i >= 0; i--) {
      const date = shiftJstDate(today, -i);
      const count = counts.get(date) ?? 0;
      days.push({ date, closed: count > 0, count });
    }
  }
  return {
    days,
    totalClosed: days.reduce((sum, d) => sum + d.count, 0),
    closedDays: days.filter((d) => d.closed).length,
  };
}
