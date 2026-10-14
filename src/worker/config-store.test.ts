import { describe, expect, it, vi } from 'vitest';
import projectsJson from '../data/devpulse/projects.json';
import {
  CONFIG_KEY,
  ConfigConflictError,
  ConfigInvalidError,
  ConfigMissingError,
  readProjectConfig,
  writeProjectConfig,
} from './config-store.ts';

function kv(initial: string | null = null) {
  let value = initial;
  const get = vi.fn(async () => value);
  const put = vi.fn(async (_key: string, text: string) => {
    value = text;
  });
  return { get, put, value: () => value } as const;
}

const now = new Date('2026-10-14T00:00:00Z');
const { projects } = projectsJson;

describe('project config store', () => {
  it('rejects reads when no value exists instead of falling back', async () => {
    await expect(readProjectConfig(kv())).rejects.toBeInstanceOf(
      ConfigMissingError,
    );
  });

  it('seeds revision 1 and reads it back', async () => {
    const store = kv();
    const written = await writeProjectConfig(store, {
      projects,
      expectedRevision: null,
      updatedBy: 'seed',
      now,
    });
    expect(written).toMatchObject({
      revision: 1,
      updatedAt: now.toISOString(),
      updatedBy: 'seed',
    });
    expect(store.put).toHaveBeenCalledWith(CONFIG_KEY, expect.any(String));
    expect(await readProjectConfig(store)).toEqual(written);
  });

  it('increments revision when the expected revision matches', async () => {
    const store = kv();
    await writeProjectConfig(store, {
      projects,
      expectedRevision: null,
      updatedBy: 'seed',
    });
    const next = await writeProjectConfig(store, {
      projects: projects.slice(0, 1),
      expectedRevision: 1,
      updatedBy: 'admin@example.com',
    });
    expect(next.revision).toBe(2);
    expect((await readProjectConfig(store)).projects).toHaveLength(1);
  });

  it('rejects a stale revision without writing', async () => {
    const store = kv();
    await writeProjectConfig(store, {
      projects,
      expectedRevision: null,
      updatedBy: 'seed',
    });
    store.put.mockClear();
    await expect(
      writeProjectConfig(store, {
        projects,
        expectedRevision: 5,
        updatedBy: 'admin',
      }),
    ).rejects.toMatchObject({
      constructor: ConfigConflictError,
      expected: 5,
      actual: 1,
    });
    expect(store.put).not.toHaveBeenCalled();
  });

  it('rejects creating over an existing value and updating a missing one', async () => {
    const store = kv();
    await expect(
      writeProjectConfig(store, {
        projects,
        expectedRevision: 1,
        updatedBy: 'admin',
      }),
    ).rejects.toBeInstanceOf(ConfigConflictError);
    await writeProjectConfig(store, {
      projects,
      expectedRevision: null,
      updatedBy: 'seed',
    });
    await expect(
      writeProjectConfig(store, {
        projects,
        expectedRevision: null,
        updatedBy: 'seed',
      }),
    ).rejects.toBeInstanceOf(ConfigConflictError);
  });

  it('validates before writing, including duplicates', async () => {
    const store = kv();
    await expect(
      writeProjectConfig(store, {
        projects: [projects[0], projects[0]],
        expectedRevision: null,
        updatedBy: 'seed',
      }),
    ).rejects.toThrow(/duplicate/);
    await expect(
      writeProjectConfig(store, {
        projects: [{ ...projects[0], tier: 'urgent' }],
        expectedRevision: null,
        updatedBy: 'seed',
      }),
    ).rejects.toThrow();
    expect(store.put).not.toHaveBeenCalled();
  });

  it('reports malformed or schema-invalid stored values as errors', async () => {
    await expect(readProjectConfig(kv('{oops'))).rejects.toThrow(
      ConfigInvalidError,
    );
    await expect(
      readProjectConfig(kv(JSON.stringify({ projects }))),
    ).rejects.toThrow(ConfigInvalidError);
    const duplicated = JSON.stringify({
      revision: 1,
      updatedAt: now.toISOString(),
      updatedBy: 'seed',
      projects: [projects[0], projects[0]],
    });
    await expect(readProjectConfig(kv(duplicated))).rejects.toThrow(
      /duplicate/,
    );
  });

  it('refuses to overwrite a corrupt stored value', async () => {
    const store = kv('{oops');
    await expect(
      writeProjectConfig(store, {
        projects,
        expectedRevision: null,
        updatedBy: 'seed',
      }),
    ).rejects.toBeInstanceOf(ConfigInvalidError);
    expect(store.put).not.toHaveBeenCalled();
  });
});
