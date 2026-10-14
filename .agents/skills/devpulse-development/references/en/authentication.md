# Admin authentication (Cloudflare Access)

[README](../../../../../README.en.md) | [日本語](../ja/authentication.md)

`/admin*` and `/api/admin/*` are protected twice: by a Cloudflare Access
Application and by Worker-side verification (`src/worker/admin-auth.ts`). The
Worker validates `Cf-Access-Jwt-Assertion` (RS256 signature against the team
JWKS at `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, `aud`, `exp`,
`nbf`, `iss`) and then checks the `email` claim against an allow list. This is
independent of `REPORTS_TOKEN`; the CI bearer token never grants admin access.
Responses: no/invalid/expired token 401, `aud` mismatch or email not allowed 403,
missing Access settings 503 (fail closed).

Worker secrets (set in the dashboard, not in shell arguments):

| Name | Value |
|---|---|
| `ACCESS_TEAM_DOMAIN` | Team domain such as `<team>.cloudflareaccess.com` |
| `ACCESS_AUD` | Application Audience (AUD) tag of the Access Application |
| `ADMIN_ALLOWED_EMAILS` | Comma-separated allowed emails (one for this project) |

### Access setup

1. Zero Trust > Access > Applications > add a self-hosted application with the
   public hostnames/paths `/admin*` and `/api/admin/*` on the production domain.
2. Add GitHub as the login method and a policy that allows only the owner's email.
3. Copy the Application's AUD tag and the team domain into the secrets above.
4. Pricing and seats: Cloudflare Zero Trust has had a free plan for a small
   number of users (50 at last check), but the current limits and prices
   must be confirmed in the Cloudflare dashboard. **Verification required**.

### Disable `workers.dev` and preview URLs

Access only guards the hostname it is attached to, so the unprotected
`workers.dev` and preview URLs must be turned off: Workers & Pages > devpulse >
Settings > Domains & Routes, disable **workers.dev** and **Preview URLs**
(or put those hostnames behind the same Access Application). Note the Worker
also rejects requests without a valid JWT, but Access should still be the first line.

### Local development bypass and production

For local development only, create `.dev.vars` (never commit) with
`ADMIN_AUTH_BYPASS=1`. The bypass is honored only when the variable is exactly
`1` **and** the request host is `localhost`, `127.0.0.1` or `[::1]`. It is not
declared in `cloudflare.config.ts`, so it does not exist in the deployed
Worker; and even if it were set there, requests on real hostnames
still require a valid Access JWT. Do not set it in production.

### Verify that unauthenticated access is blocked

Run these against the production domain and the `workers.dev` hostname; every
request must return 302 to the Access login (from Access) or 401/403, never 200/404 from the app:

```bash
for host in https://<production-host> https://devpulse.<subdomain>.workers.dev; do
  for path in /admin /admin/ /api/admin/projects; do
    curl -s -o /dev/null -w "$host$path %{http_code}\n" "$host$path"
  done
done
```

Also confirm a forged header does not help: `curl -H 'Cf-Access-Jwt-Assertion: x.y.z'`
must return 401. Automated cases (missing, bad signature, wrong `aud`, expired,
disallowed email) run in `pnpm test` (`src/worker/admin-auth.test.ts`).
Live checks against Cloudflare were not performed as part of the code change.
