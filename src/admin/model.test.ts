import { describe, expect, it } from 'vitest';
import type { ProjectDefinition } from '../lib/devpulse/types.ts';
import {
  type Candidate,
  diffLines,
  dropBefore,
  moveToTier,
  moveWithinTier,
  newProjectFrom,
  splitIssues,
} from './model.ts';

const make = (
  id: string,
  tier: ProjectDefinition['tier'] = 'high',
): ProjectDefinition => ({
  id,
  slug: id,
  name: id.toUpperCase(),
  description: '',
  repository: `Owner/${id}`,
  published: true,
  lifecycle: 'active',
  tier,
});

describe('admin model', () => {
  const [a, b, c] = [make('a'), make('b'), make('c', 'low')];

  it('swaps with the neighbour in the same tier only', () => {
    expect(moveWithinTier([a, b, c], a, 1).map((p) => p.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(moveWithinTier([a, b, c], a, -1)).toEqual([a, b, c]);
  });

  it('moves a project to the end of another tier', () => {
    const moved = moveToTier([a, b, c], a, 'low');
    expect(moved.map((p) => `${p.id}:${p.tier}`)).toEqual([
      'b:high',
      'c:low',
      'a:low',
    ]);
  });

  it('drops before a target in the same tier and ignores other tiers', () => {
    expect(dropBefore([a, b, c], b, a).map((p) => p.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(dropBefore([a, b, c], a, c)).toEqual([a, b, c]);
  });

  it('describes additions, removals, edits and reorderings', () => {
    const lines = diffLines([a, b], [{ ...b, published: false }, a, make('d')]);
    expect(lines).toContain('追加: D (Owner/d)');
    expect(lines).toContain('変更: B / 公開: true -> false');
    expect(lines.some((l) => l.startsWith('並び替え: high Tier'))).toBe(true);
    expect(diffLines([a, b], [a, b])).toEqual([]);
    expect(diffLines([a, b], [a]).at(0)).toBe('削除: B (Owner/b)');
  });

  it('maps validation paths onto projects', () => {
    const { byProject, general } = splitIssues(
      [
        { path: 'projects.1.name', message: 'bad' },
        { path: 'projects.9.name', message: 'gone' },
        { path: 'revision', message: 'stale' },
      ],
      [a, b],
    );
    expect(byProject['owner/b']).toEqual([{ field: 'name', message: 'bad' }]);
    expect(general).toEqual(['projects.9.name: gone', 'revision: stale']);
  });

  it('avoids slug collisions for a new project', () => {
    const candidate: Candidate = {
      repository: 'Owner/a',
      description: '',
      defaults: make('a', 'low'),
    };
    const created = newProjectFrom(candidate, [a]);
    expect(created.slug).toBe('a-2');
    expect(created.id).toBe('a-2');
  });
});
