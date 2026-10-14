import { TIERS, type Tier } from './types.ts';

/**
 * 表示順: Tier(high → medium → low) → 入力配列内の順序。
 * Home・サイドバー・日次レポートで共通に使う。元の配列は変更しない。
 */
export function sortProjectsByTier<T>(
  items: T[],
  getTier: (item: T) => Tier,
): T[] {
  return items
    .map((item, index) => ({ item, index, rank: TIERS.indexOf(getTier(item)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}
