import { describe, expect, it } from 'vitest';
import worker from '../index.ts';
import type { Env } from '../sync.ts';
import { CLIENT_SCRIPT } from './client-script.ts';

const PAGES = ['/admin', '/admin/', '/admin/index.html'];
const ASSETS = ['/admin/app.js', '/admin/app.css'];

const env = (extra = {}) =>
  ({
    ADMIN_AUTH_BYPASS: '1',
    ASSETS: {
      fetch: () => {
        throw new Error('admin must never reach static assets');
      },
    },
    ...extra,
  }) as unknown as Env;

const get = (path: string, host = 'http://localhost:8787', e = env()) =>
  worker.fetch(new Request(`${host}${path}`), e);

describe('admin page serving', () => {
  it.each([...PAGES, ...ASSETS])(
    'serves %s no-store behind the gate',
    async (path) => {
      const response = await get(path);
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Content-Security-Policy')).toContain(
        "script-src 'self'",
      );
    },
  );

  it('serves HTML with script and stylesheet from /admin', async () => {
    const response = await get('/admin');
    expect(response.headers.get('Content-Type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('/admin/app.js');
    expect(html).toContain('即時反映');
    expect(html).toContain('次回ビルドで反映');
  });

  it.each([...PAGES, ...ASSETS])(
    'does not leak %s without admin credentials',
    async (path) => {
      const response = await get(path, 'https://devpulse.example', {
        ...env(),
        ADMIN_AUTH_BYPASS: undefined,
      } as unknown as Env);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('<html');
      const unauth = await get(
        path,
        'https://devpulse.example',
        env({
          ADMIN_AUTH_BYPASS: undefined,
          ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
          ACCESS_AUD: 'aud',
          ADMIN_ALLOWED_EMAILS: 'a@example.com',
        }),
      );
      expect(unauth.status).toBe(401);
      expect(await unauth.text()).toBe('Unauthorized');
    },
  );

  it('ignores the bypass flag on non-loopback hosts', async () => {
    const response = await get('/admin', 'https://devpulse.example');
    expect(response.status).toBe(503);
  });

  it('returns 404 for unknown admin paths and 405 for non-GET', async () => {
    expect((await get('/admin/secret.js')).status).toBe(404);
    const post = await worker.fetch(
      new Request('http://localhost:8787/admin', { method: 'POST' }),
      env(),
    );
    expect(post.status).toBe(405);
  });
});

describe('admin client script', () => {
  it('is syntactically valid', () => {
    expect(() => new Function(CLIENT_SCRIPT)).not.toThrow();
  });

  it('never writes markup into the DOM', () => {
    expect(CLIENT_SCRIPT).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
    expect(CLIENT_SCRIPT).not.toMatch(/document\.write|\beval\(/);
  });
});
