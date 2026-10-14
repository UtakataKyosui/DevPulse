import { jstCalendarDayDiff } from '@devpulse/domain/devpulse/jst';
import type {
  HealthAssessment,
  Lifecycle,
} from '@devpulse/domain/devpulse/types';

export const HEALTH_LABELS = {
  stable: '安定',
  warning: '注意',
  stalled: '停滞',
  unknown: '不明',
} as const;

export const LIFECYCLE_LABELS: Record<Exclude<Lifecycle, 'active'>, string> = {
  planned: '計画中',
  paused: '休止中',
  completed: '完了',
  archived: 'アーカイブ',
};

/** 最終コミットからの Asia/Tokyo 暦日差。未来や不正値は null */
export function calcElapsedDays(
  lastActivityAt: string | null,
  now: Date,
): number | null {
  if (!lastActivityAt) return null;
  // 同一 JST 暦日内の未来時刻は暦日差が 0 になるため、時刻そのものを先に比較する
  const last = Date.parse(lastActivityAt);
  if (Number.isNaN(last) || last > now.getTime()) return null;
  const days = jstCalendarDayDiff(lastActivityAt, now);
  return days === null || days < 0 ? null : days;
}

export function classifyElapsedDays(days: number | null) {
  if (days === null) return 'unknown' as const;
  if (days <= 2) return 'stable' as const;
  if (days <= 4) return 'warning' as const;
  return 'stalled' as const;
}

/** active 以外は Health を評価せず、Lifecycle の表示ラベルを返す */
export function assessHealth(input: {
  lifecycle: Lifecycle;
  lastActivityAt: string | null;
  now: Date;
}): HealthAssessment {
  const elapsedDays = calcElapsedDays(input.lastActivityAt, input.now);
  if (input.lifecycle !== 'active') {
    return {
      evaluated: false,
      status: 'unknown',
      label: LIFECYCLE_LABELS[input.lifecycle],
      elapsedDays,
    };
  }
  const status = classifyElapsedDays(elapsedDays);
  return {
    evaluated: true,
    status,
    label: HEALTH_LABELS[status],
    elapsedDays,
  };
}
