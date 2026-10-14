import { describe, expect, it } from 'vitest';
import { getPriority, parsePriorities, sortByPriority } from './priorities.ts';

describe('manual priorities', () => {
  it('restores saved values and ignores invalid storage', () => {
    expect(parsePriorities('{"a":"highest","b":"bad","c":4}')).toEqual({
      a: 'highest',
    });
    for (const raw of [null, 'broken', 'null', '[]', '42']) {
      expect(parsePriorities(raw)).toEqual({});
    }
    expect(getPriority({}, 'toString')).toBe('unset');
  });

  it('sorts by priority, preserves ties and does not mutate the original', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    const priorities = parsePriorities(
      '{"b":"next","c":"highest","d":"next","e":"later"}',
    );
    expect(sortByPriority(cards, priorities).map((c) => c.id)).toEqual([
      'c',
      'b',
      'd',
      'e',
      'a',
    ]);
    expect(cards.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    priorities.c = 'unset';
    expect(sortByPriority(cards, priorities).map((c) => c.id)).toEqual([
      'b',
      'd',
      'e',
      'a',
      'c',
    ]);
  });
});
