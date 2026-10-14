import { describe, expect, it, vi } from 'vitest';
import projectsJson from '../data/devpulse/projects.sample.json';
import {
  CONFIG_HISTORY_KEY,
  CONFIG_KEY,
  ConfigConflictError,
  ConfigInvalidError,
  ConfigMissingError,
  HISTORY_LIMIT,
  readProjectConfig,
  readProjectHistory,
  writeProjectConfig,
} from './config-store.ts';

function kv(initial: string | null = null) {
  const values = new Map<string, string>();
  if (initial !== null) values.set(CONFIG_KEY, initial);
  const get = vi.fn(async (key: string) => values.get(key) ?? null);
  const put = vi.fn(async (key: string, text: string) => {
    values.set(key, text);
  });
  return { get, put, values } as const;
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

  it('keeps the replaced revisions newest first, without the current one', async () => {
    const store = kv();
    const seed = await writeProjectConfig(store, {
      projects,
      expectedRevision: null,
      updatedBy: 'seed',
    });
    // The first write has nothing to replace, so the seed never touches history.
    expect(store.values.has(CONFIG_HISTORY_KEY)).toBe(false);
    await writeProjectConfig(store, {
      projects: projects.slice(0, 1),
      expectedRevision: 1,
      updatedBy: 'admin',
    });
    await writeProjectConfig(store, {
      projects: projects.slice(0, 2),
      expectedRevision: 2,
      updatedBy: 'admin',
    });
    const history = await readProjectHistory(store);
    expect(history.map((entry) => entry.revision)).toEqual([2, 1]);
    expect(history[1]).toEqual(seed);
    expect((await readProjectConfig(store)).revision).toBe(3);
  });

  it(`drops entries beyond ${HISTORY_LIMIT}`, async () => {
    const store = kv();
    for (let revision = 0; revision <= HISTORY_LIMIT + 2; revision++)
      await writeProjectConfig(store, {
        projects,
        expectedRevision: revision === 0 ? null : revision,
        updatedBy: 'admin',
      });
    const history = await readProjectHistory(store);
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0]?.revision).toBe(HISTORY_LIMIT + 2);
    expect(history.at(-1)?.revision).toBe(3);
  });

  it('writes history before the config and does not duplicate a revision', async () => {
    const store = kv();
    await writeProjectConfig(store, {
      projects,
      expectedRevision: null,
      updatedBy: 'seed',
    });
    store.put.mockClear();
    // The config put fails after history was written; the retry must not
    // record revision 1 twice.
    store.put.mockImplementationOnce(async (key, text) => {
      store.values.set(key, text);
    });
    store.put.mockImplementationOnce(async () => {
      throw new Error('KV unavailable');
    });
    await expect(
      writeProjectConfig(store, {
        projects,
        expectedRevision: 1,
        updatedBy: 'admin',
      }),
    ).rejects.toThrow('KV unavailable');
    expect(store.put.mock.calls.map(([key]) => key)).toEqual([
      CONFIG_HISTORY_KEY,
      CONFIG_KEY,
    ]);
    await writeProjectConfig(store, {
      projects,
      expectedRevision: 1,
      updatedBy: 'admin',
    });
    expect(
      (await readProjectHistory(store)).map((entry) => entry.revision),
    ).toEqual([1]);
  });

  it('refuses to write over a corrupt history', async () => {
    const store = kv();
    await writeProjectConfig(store, {
      projects,
      expectedRevision: null,
      updatedBy: 'seed',
    });
    store.values.set(CONFIG_HISTORY_KEY, '{oops');
    store.put.mockClear();
    await expect(
      writeProjectConfig(store, {
        projects,
        expectedRevision: 1,
        updatedBy: 'admin',
      }),
    ).rejects.toThrow(new RegExp(`${CONFIG_HISTORY_KEY} is invalid`));
    expect(store.put).not.toHaveBeenCalled();
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
