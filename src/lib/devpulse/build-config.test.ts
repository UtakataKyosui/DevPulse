import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  fetchPublishedProjects,
  GENERATED_MARKER,
  loadBuildProjects,
  PROJECTS_CACHE,
  syncProjectPages,
} from './build-config.ts';
import type { ProjectDefinition } from './types.ts';

function project(
  slug: string,
  overrides: Partial<ProjectDefinition> = {},
): ProjectDefinition {
  return {
    id: slug,
    slug,
    name: `Name ${slug}`,
    description: 'desc',
    repository: `owner/${slug}`,
    published: true,
    lifecycle: 'active',
    tier: 'medium',
    ...overrides,
  };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'devpulse-build-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('fetchPublishedProjects', () => {
  const origin = new URL('https://example.com');

  it('parses the projects API response', async () => {
    const fetchImpl = (async () =>
      Response.json({ projects: [project('a')] })) as typeof fetch;
    expect(await fetchPublishedProjects(origin, fetchImpl)).toEqual([
      project('a'),
    ]);
  });

  it('fails on HTTP errors, network errors and invalid bodies', async () => {
    await expect(
      fetchPublishedProjects(
        origin,
        (async () => new Response('', { status: 503 })) as typeof fetch,
      ),
    ).rejects.toThrow('HTTP 503');
    await expect(
      fetchPublishedProjects(origin, (async () => {
        throw new Error('offline');
      }) as typeof fetch),
    ).rejects.toThrow('offline');
    await expect(
      fetchPublishedProjects(origin, (async () =>
        Response.json({ projects: [{ slug: 'x' }] })) as typeof fetch),
    ).rejects.toThrow();
  });
});

describe('loadBuildProjects', () => {
  it('fails without a fetched config instead of falling back to a fixture', () => {
    expect(() => loadBuildProjects(root, {})).toThrow('not fetched');
  });

  it('reads the fetched cache', () => {
    mkdirSync(path.join(root, '.projects-cache'));
    writeFileSync(
      path.join(root, PROJECTS_CACHE),
      JSON.stringify({ projects: [project('a')] }),
    );
    expect(loadBuildProjects(root, {})).toEqual([project('a')]);
  });

  it('uses a fixture only when explicitly set', () => {
    writeFileSync(
      path.join(root, 'fixture.json'),
      JSON.stringify({ projects: [project('f')] }),
    );
    expect(
      loadBuildProjects(root, { DEVPULSE_PROJECTS_FIXTURE: 'fixture.json' }),
    ).toEqual([project('f')]);
    expect(() =>
      loadBuildProjects(root, { DEVPULSE_PROJECTS_FIXTURE: 'missing.json' }),
    ).toThrow('not found');
  });
});

describe('syncProjectPages', () => {
  const page = (slug: string) => path.join(root, slug, 'index.mdx');
  function handWritten(slug: string) {
    mkdirSync(path.join(root, slug));
    writeFileSync(page(slug), '# hand written\n');
  }

  it('generates pages for published projects without a hand-written MDX', () => {
    syncProjectPages(root, [project('fresh', { name: 'Fresh <app>' })]);
    const mdx = readFileSync(page('fresh'), 'utf8');
    expect(mdx).toContain(GENERATED_MARKER);
    expect(mdx).toContain('<ProjectDetail slug="fresh">');
    expect(mdx).toContain('# Fresh \\<app\\>');
    expect(readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe(
      '/fresh/\n',
    );
  });

  it('prefers a hand-written MDX and leaves it untouched', () => {
    handWritten('mine');
    const excluded = syncProjectPages(root, [project('mine')]);
    expect(readFileSync(page('mine'), 'utf8')).toBe('# hand written\n');
    expect(excluded).toEqual([]);
  });

  it('excludes hand-written MDX of unpublished or removed slugs', () => {
    handWritten('draft');
    handWritten('removed');
    const excluded = syncProjectPages(root, [
      project('draft', { published: false }),
    ]);
    expect(excluded.sort()).toEqual([
      'projects/draft/**',
      'projects/removed/**',
    ]);
    expect(existsSync(page('draft'))).toBe(true);
  });

  it('removes generated pages once the project is unpublished', () => {
    syncProjectPages(root, [project('p')]);
    expect(existsSync(page('p'))).toBe(true);
    syncProjectPages(root, [project('p', { published: false })]);
    expect(existsSync(path.join(root, 'p'))).toBe(false);
    syncProjectPages(root, []);
    expect(existsSync(path.join(root, 'p'))).toBe(false);
  });

  it('writes the sidebar from published projects only', () => {
    syncProjectPages(root, [
      project('shown'),
      project('hidden', { published: false }),
    ]);
    const meta = readFileSync(path.join(root, '_meta.json'), 'utf8');
    expect(meta).toContain('/projects/shown/');
    expect(meta).not.toContain('hidden');
  });
});
