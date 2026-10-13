const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Asia/Tokyo の暦日 (YYYY-MM-DD)。不正な日時は null */
export function toJstDate(input: string | Date): string | null {
  const time = (input instanceof Date ? input : new Date(input)).getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** to - from の Asia/Tokyo 暦日差。同日は 0。どちらかが不正なら null */
export function jstCalendarDayDiff(
  from: string | Date,
  to: string | Date,
): number | null {
  const a = toJstDate(from);
  const b = toJstDate(to);
  if (a === null || b === null) return null;
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

/** JST 暦日 date から days 日ずらした暦日 */
export function shiftJstDate(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}
