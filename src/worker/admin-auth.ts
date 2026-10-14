import { z } from 'zod';

/**
 * Cloudflare Access verification for /admin* and /api/admin/*.
 * Independent from REPORTS_TOKEN (CI bearer): the two must never be mixed.
 */
export type AdminAuthEnv = {
  /**
   * Access team domain (e.g. `example.cloudflareaccess.com`, no scheme) and the
   * Application Audience (AUD) tag of the Access Application. Empty = not configured.
   */
  ACCESS_SETTINGS?: { teamDomain: string; aud: string };
  /** Comma-separated allowed emails. */
  ADMIN_ALLOWED_EMAILS?: string;
  /**
   * Local development only. Honored solely when set to `1` AND the request
   * hostname is loopback. Never declare it in cloudflare.config.ts.
   */
  ADMIN_AUTH_BYPASS?: string;
};

export type AdminAuthResult =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403 | 503 };

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const CLOCK_SKEW_SECONDS = 30;
const JWKS_TTL_MS = 10 * 60 * 1000;

const headerSchema = z.object({ alg: z.literal('RS256'), kid: z.string() });
const payloadSchema = z.object({
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
  nbf: z.number().optional(),
  iss: z.string(),
  email: z.string().optional(),
});
const jwksSchema = z.object({
  keys: z.array(
    z.object({ kid: z.string(), kty: z.literal('RSA') }).passthrough(),
  ),
});

type Jwk = z.infer<typeof jwksSchema>['keys'][number];
const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

/** Matches the `/admin*` and `/api/admin*` prefixes (case-insensitive, fail closed). */
export function isAdminPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.startsWith('/admin') || lower.startsWith('/api/admin');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function decodeJson(value: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}

function normalizedTeamDomain(raw: string | undefined): string | null {
  const domain = raw
    ?.trim()
    .replace(/^https:\/\//, '')
    .replace(/\/+$/, '');
  return domain && /^[a-z0-9.-]+$/i.test(domain) ? domain : null;
}

async function loadKeys(
  domain: string,
  fetcher: typeof fetch,
  force: boolean,
): Promise<Jwk[]> {
  const cached = jwksCache.get(domain);
  if (!force && cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS)
    return cached.keys;
  const response = await fetcher(`https://${domain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`JWKS HTTP ${response.status}`);
  const { keys } = jwksSchema.parse(await response.json());
  jwksCache.set(domain, { keys, fetchedAt: Date.now() });
  return keys;
}

/** Test helper: forget cached team keys. */
export function resetAdminKeyCache(): void {
  jwksCache.clear();
}

export async function authorizeAdmin(
  request: Request,
  env: AdminAuthEnv,
  fetcher: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<AdminAuthResult> {
  const url = new URL(request.url);
  if (env.ADMIN_AUTH_BYPASS === '1' && LOOPBACK_HOSTS.has(url.hostname))
    return { ok: true, email: 'local-bypass' };

  const domain = normalizedTeamDomain(env.ACCESS_SETTINGS?.teamDomain);
  const aud = env.ACCESS_SETTINGS?.aud?.trim();
  const allowed = (env.ADMIN_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  // Fail closed when misconfigured.
  if (!domain || !aud || allowed.length === 0)
    return { ok: false, status: 503 };

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { ok: false, status: 401 };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 401 };
  const [h, p, s] = parts as [string, string, string];

  try {
    const header = headerSchema.safeParse(decodeJson(h));
    if (!header.success) return { ok: false, status: 401 };
    const signed = new TextEncoder().encode(`${h}.${p}`);
    const signature = base64UrlToBytes(s);
    const verify = async (force: boolean) => {
      const jwk = (await loadKeys(domain, fetcher, force)).find(
        (k) => k.kid === header.data.kid,
      );
      if (!jwk) return false;
      const key = await crypto.subtle.importKey(
        'jwk',
        jwk as JsonWebKey,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed);
    };
    // Retry once with fresh keys to survive key rotation.
    if (!(await verify(false)) && !(await verify(true)))
      return { ok: false, status: 401 };

    const payload = payloadSchema.safeParse(decodeJson(p));
    if (!payload.success) return { ok: false, status: 401 };
    const claims = payload.data;
    const seconds = Math.floor(now / 1000);
    if (claims.exp + CLOCK_SKEW_SECONDS < seconds)
      return { ok: false, status: 401 };
    if (claims.nbf !== undefined && claims.nbf - CLOCK_SKEW_SECONDS > seconds)
      return { ok: false, status: 401 };
    if (claims.iss !== `https://${domain}`) return { ok: false, status: 401 };
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(aud)) return { ok: false, status: 403 };
    const email = claims.email?.toLowerCase();
    if (!email || !allowed.includes(email)) return { ok: false, status: 403 };
    return { ok: true, email };
  } catch {
    return { ok: false, status: 401 };
  }
}

export async function adminGate(
  request: Request,
  env: AdminAuthEnv,
  fetcher: typeof fetch = fetch,
): Promise<Response | null> {
  const result = await authorizeAdmin(request, env, fetcher);
  if (result.ok) return null;
  return new Response(result.status === 401 ? 'Unauthorized' : 'Forbidden', {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
