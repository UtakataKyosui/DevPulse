export const PRIORITY_LABELS = {
  highest: '最優先',
  next: '次に着手',
  later: '後回し',
  unset: '未設定',
} as const;

export type Priority = keyof typeof PRIORITY_LABELS;
export type Priorities = Record<string, Priority>;
export const PRIORITIES_STORAGE_KEY = 'devpulse:priorities:v1';

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && Object.hasOwn(PRIORITY_LABELS, value);
}

export function parsePriorities(raw: string | null): Priorities {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([, priority]) => isPriority(priority)),
    );
  } catch {
    return {};
  }
}

export function getPriority(priorities: Priorities, id: string): Priority {
  return Object.hasOwn(priorities, id) ? priorities[id] : 'unset';
}

export function sortByPriority<T extends { id: string }>(
  cards: T[],
  priorities: Priorities,
): T[] {
  const rank: Record<Priority, number> = {
    highest: 0,
    next: 1,
    later: 2,
    unset: 3,
  };
  return [...cards].sort(
    (a, b) =>
      rank[getPriority(priorities, a.id)] - rank[getPriority(priorities, b.id)],
  );
}
