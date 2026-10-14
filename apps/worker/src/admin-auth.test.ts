import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminGate, authorizeAdmin, resetAdminKeyCache } from './admin-auth.ts';
import worker from './index.ts';
import type { Env } from './sync.ts';

const DOMAIN = 'team.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const NOW = 1_800_000_000_000;
const config = {
  ACCESS_SETTINGS: { teamDomain: DOMAIN, aud: AUD },
  ADMIN_ALLOWED_EMAILS: 'Owner@example.com',
};

const encoder = new TextEncoder();
function b64url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === 'string' ? encoder.encode(input) : new Uint8Array(input);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const algorithm = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};
let good: CryptoKeyPair;
let other: CryptoKeyPair;
let jwks: Response;

async function sign(
  claims: Record<string, unknown>,
  pair: CryptoKeyPair = good,
  kid = 'k1',
) {
  const head = b64url(JSON.stringify({ alg: 'RS256', kid }));
  const body = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    pair.privateKey,
    encoder.encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(sig)}`;
}

const valid = {
  aud: [AUD],
  exp: NOW / 1000 + 3600,
  iss: `https://${DOMAIN}`,
  email: 'owner@example.com',
};

const fetcher = vi.fn(async () => jwks.clone());
function req(token?: string, url = 'https://devpulse.example/api/admin/x') {
  return new Request(url, {
    headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {},
  });
}
const status = async (token?: string, env = config) =>
  (await authorizeAdmin(req(token), env, fetcher as never, NOW)).ok
    ? 200
    : (
        (await authorizeAdmin(req(token), env, fetcher as never, NOW)) as {
          status: number;
        }
      ).status;

beforeAll(async () => {
  good = (await crypto.subtle.generateKey(algorithm, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  other = (await crypto.subtle.generateKey(algorithm, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', good.publicKey);
  jwks = Response.json({ keys: [{ ...jwk, kid: 'k1' }] });
});

beforeEach(() => {
  resetAdminKeyCache();
  fetcher.mockClear();
});

describe('admin Cloudflare Access verification', () => {
  it('accepts a valid token from an allowed email', async () => {
    expect(await status(await sign(valid))).toBe(200);
  });

  it('rejects a missing token with 401', async () => {
    expect(await status(undefined)).toBe(401);
  });

  it('rejects malformed tokens with 401', async () => {
    expect(await status('not-a-jwt')).toBe(401);
    expect(await status('a.b.c')).toBe(401);
  });

  it('rejects a bad signature with 401', async () => {
    expect(await status(await sign(valid, other))).toBe(401);
    const token = await sign(valid);
    const [h, , s] = token.split('.');
    const forged = `${h}.${b64url(JSON.stringify({ ...valid, email: 'x@y.z' }))}.${s}`;
    expect(await status(forged)).toBe(401);
  });

  it('rejects an unknown key id with 401', async () => {
    expect(await status(await sign(valid, good, 'unknown'))).toBe(401);
  });

  it('rejects an audience mismatch with 403', async () => {
    expect(await status(await sign({ ...valid, aud: ['other'] }))).toBe(403);
  });

  it('rejects an expired token with 401', async () => {
    expect(await status(await sign({ ...valid, exp: NOW / 1000 - 600 }))).toBe(
      401,
    );
  });

  it('rejects an email outside the allow list with 403', async () => {
    expect(
      await status(await sign({ ...valid, email: 'intruder@example.com' })),
    ).toBe(403);
    const { email: _email, ...noEmail } = valid;
    expect(await status(await sign(noEmail))).toBe(403);
  });

  it('rejects a different issuer with 401', async () => {
    expect(
      await status(await sign({ ...valid, iss: 'https://evil.example' })),
    ).toBe(401);
    const { iss: _iss, ...noIssuer } = valid;
    expect(await status(await sign(noIssuer))).toBe(401);
  });

  it('fails closed when Access settings are missing', async () => {
    expect(await status(await sign(valid), {} as typeof config)).toBe(503);
  });

  it('fails closed while the Access settings are still empty', async () => {
    expect(
      await status(await sign(valid), {
        ...config,
        ACCESS_SETTINGS: { teamDomain: '', aud: '' },
      }),
    ).toBe(503);
  });

  it('fails closed when only one Access setting is present', async () => {
    expect(
      await status(await sign(valid), {
        ...config,
        ACCESS_SETTINGS: { teamDomain: DOMAIN },
      } as unknown as typeof config),
    ).toBe(503);
    expect(
      await status(await sign(valid), {
        ...config,
        ACCESS_SETTINGS: { aud: AUD },
      } as unknown as typeof config),
    ).toBe(503);
  });

  it('honors the bypass only on loopback hosts', async () => {
    const env = { ADMIN_AUTH_BYPASS: '1' };
    const local = await authorizeAdmin(
      req(undefined, 'http://localhost:8787/admin'),
      env,
      fetcher as never,
    );
    expect(local.ok).toBe(true);
    const remote = await adminGate(req(), env, fetcher as never);
    expect(remote?.status).toBe(503);
    const remoteConfigured = await adminGate(
      req(),
      { ...config, ...env },
      fetcher as never,
    );
    expect(remoteConfigured?.status).toBe(401);
  });
});

describe('worker admin gate', () => {
  const env = (extra = {}) => ({ ...config, ...extra }) as unknown as Env;

  it.each([
    '/admin',
    '/admin/',
    '/admin/index.html',
    '/administrator',
    '/ADMIN',
    '/api/admin/projects',
  ])('denies unauthenticated %s', async (path) => {
    const response = await worker.fetch(
      new Request(`https://devpulse.example${path}`),
      env(),
    );
    expect(response.status).toBe(401);
  });

  it('does not accept REPORTS_TOKEN as admin credentials', async () => {
    const token = 't'.repeat(32);
    const response = await worker.fetch(
      new Request('https://devpulse.example/api/admin/projects', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env({ REPORTS_TOKEN: token }),
    );
    expect(response.status).toBe(401);
  });

  it('returns a placeholder 404 once authenticated via local bypass', async () => {
    const response = await worker.fetch(
      new Request('http://localhost:8787/api/admin/projects'),
      env({ ADMIN_AUTH_BYPASS: '1' }),
    );
    expect(response.status).toBe(404);
  });
});
