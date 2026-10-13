import type { DataFreshness } from './types.ts';

/** 暫定値。同期がこの時間を超えて無い場合は stale */
export const DEFAULT_STALE_AFTER_HOURS = 48;

/** snapshot が無い、または fetchedAt が不正/未来の場合も stale 扱い */
export function assessFreshness(
  fetchedAt: string | null,
  now: Date,
  staleAfterHours: number = DEFAULT_STALE_AFTER_HOURS,
): DataFreshness {
  const time = fetchedAt ? Date.parse(fetchedAt) : Number.NaN;
  if (Number.isNaN(time)) {
    return { fetchedAt, ageHours: null, stale: true };
  }
  const ageHours = (now.getTime() - time) / 3_600_000;
  return {
    fetchedAt,
    ageHours,
    stale: ageHours < 0 || ageHours > staleAfterHours,
  };
}
