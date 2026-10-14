# Rspress website

## shadcn/ui

Tailwind CSS v4 is integrated through the Rsbuild plugin. `components.json`
configures shadcn/ui primitives in `src/components/ui/`. Dashboard cards, badges,
progress indicators and notices use these components. Project details use Table
for milestones and recent closures, and Chart (Recharts) for daily Issue closures.
Import them using `@/components/ui/button` or `@/components/ui/badge` in TSX/MDX.
Add more components with:

```bash
pnpm dlx shadcn@latest add card
```

`tailwind.css` maps colors to Rspress theme variables and follows its `.dark`
class. Tailwind Preflight is omitted to preserve the documentation theme.

## Deploy to Cloudflare Workers

Use Node.js 22.18 or later and pnpm. Install dependencies with
`pnpm install --frozen-lockfile`, then sign in and deploy:

```bash
cf auth login
pnpm run deploy:bootstrap # first deployment only; see daily report setup below
```

`pnpm run deploy` restores saved reports, builds Rspress into `doc_build/`,
and deploys it with `cf`. It requires `DEVPULSE_SITE_URL` and `REPORTS_TOKEN`.
Use `deploy:bootstrap` only for the first deployment before the report API exists.
To validate without uploading, run `pnpm run deploy:check`.
The Worker name is `devpulse` in `cloudflare.config.ts`.

The static assets build uses Wrangler internally through `cf`; the deployment
command remains `cf deploy`. Keep `wrangler.config.ts` alongside the Cloudflare
configuration, as it specifies the assets directory. No `cf init` is needed
once these configuration files exist.

## Admin authentication (Cloudflare Access)

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
   must be confirmed in the Cloudflare dashboard. **要確認**.

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

## Project configuration store

The project list is stored as one JSON document at key `config:projects:v1` in
the `CONFIG` Workers KV namespace: `{ revision, updatedAt, updatedBy, projects }`.
It is a separate namespace from `SNAPSHOTS` because the hourly sync overwrites
`SNAPSHOTS` wholesale, while `CONFIG` holds hand-edited data that needs its own
lifecycle (backup, access scoping, listing). `src/worker/config-store.ts` reads
and writes it. A missing or invalid value is an error; there is no fallback to
`projects.json`. Writes validate with `projectConfigSchema` (duplicate id, slug
and repository are rejected) and are refused when the revision re-read just
before the write differs from the caller's expected revision. KV has no
compare-and-swap, so two writes racing between that re-read and the put are not
detected; this relies on a single administrator.

Seed `projects.json` once, with revision 1 (it refuses to overwrite an existing
value):

```bash
pnpm run config:seed                                            # local cf dev KV
pnpm run config:seed -- --remote --namespace-id <CONFIG namespace id>
```

The local seed writes under `.wrangler/state` using the binding name as the
namespace id. Find the production id in the Cloudflare dashboard after
`cf deploy` provisions `CONFIG`.

### Propagation delay

Per the [Workers KV documentation](https://developers.cloudflare.com/kv/concepts/how-kv-works/),
a write is visible immediately (usually) only in the location where it was made.
Other locations serve cached values and see the change "up to 60 seconds or
more" later; the default `cacheTtl` is 60 seconds. Negative lookups (key not
found) are cached the same way, and locations that read the key recently take
longer. The documentation gives no upper bound beyond "or more", so the exact
maximum is **要確認**; plan for roughly one minute plus an unquantified margin.

Effective delay by consumer, once they read from `CONFIG`: Worker reads (sync
Cron, `/api/*`) see a change after the KV delay above; the sidebar and detail
pages also wait for the next hourly build (`15 * * * *`) to fetch the config,
so up to about one hour plus the KV delay and build time.

### Build-time sidebar and detail pages

`pnpm run projects:fetch` reads `GET /api/projects` from `DEVPULSE_SITE_URL`
(public, no token) into `.projects-cache/projects.json`. `rspress.config.ts`
then writes `docs/projects/_meta.json`, generates
`docs/projects/<slug>/index.mdx` from a template for published slugs without a
hand-written MDX (generated files carry a marker and are git-ignored), and
excludes the hand-written MDX of unpublished or removed slugs. Without a
fetched config the build exits non-zero; it never falls back to a fixture. To
use one locally or in a PR check, set it explicitly:

```sh
DEVPULSE_PROJECTS_FIXTURE=src/data/devpulse/projects.sample.json pnpm run build
```

`reports.yml` runs the fetch before the build, so a failed fetch stops the
deploy. `deploy:bootstrap` and `deploy:check` need the fetch or the fixture
variable as well. `docs/projects/_meta.json` is rewritten on every build; do
not commit the fixture's version.

## Progress synchronization

The `published` projects in the KV config (`config:projects:v1`) define the repositories. The Worker
reads it on every run, fetches their public GitHub milestones, closed issues and latest commits every
hour (`0 * * * *`, UTC), then writes normalized snapshots to Workers KV.
`GET /api/snapshots` and `GET /api/projects` (tier order) read the config per request. A missing config stops the sync with an error and yields 503, never a fixture. Reports use the config at generation time; past reports are unchanged.
`cf deploy` provisions the `SNAPSHOTS` namespace and installs the Cron Trigger.

GitHub requests are authenticated with the Worker secret `GITHUB_TOKEN` (see
[GitHub token](#github-token)). Transient
failures retain each repository's last successful snapshot for up to 48 hours;
404/private repositories are removed. Check Worker logs for synchronization failures
or rate limits. `snapshots.json` is the build-time fallback, not the live store.

To test locally, run `pnpm run build`, `pnpm exec cf dev`, then:

```bash
curl http://localhost:8787/cdn-cgi/local/scheduled
curl http://localhost:8787/api/snapshots
```

The API returns 503 until the first successful sync. For static-only Rspress
development, set `DEVPULSE_API_URL=''` when running `pnpm dev`.

## Daily AI reports and RSS

The Worker generates a Japanese report at **21:00 JST** (`0 12 * * *`, UTC)
for the previous JST calendar day. Issue closure counts exclude PRs and use
the half-open interval 00:00–next-day 00:00. Milestone progress, health and
deadlines describe the capture time, rather than historical day-end state.
Only a consecutive capture of the same Milestone produces a progress delta.
Failed refreshes use explicitly marked older data for at most 48 hours;
missing data and first captures have unknown deltas.

Workers AI writes a plain-text summary; deterministic counts and source links
are displayed separately. The default model is
`@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Edit `REPORT_SETTINGS` in
`cloudflare.config.ts` to select that model or
`@cf/meta/llama-3.1-8b-instruct`, and adjust `maxTokens` (100–2000) or
`maxInputChars` (1000–24000). Prompt changes require a new prompt version in
the report generator/schema. Validate Japanese output and current Workers AI
pricing/availability before enabling production inference:
[model documentation](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/).

`REPORTS` is a D1 database provisioned by `cf`, with an idempotent table
initialization in the Worker. A unique date and a 10-minute fenced lease
serialize generation. A day gets up to three automatic attempts, including
hourly recovery at 22:00 and 23:00 JST. Captured inputs survive inference failure;
completed reports never invoke AI again. Stored reports retain their URL,
GUID, publication timestamp and model metadata on every rebuild. D1 retains
all reports and captures without automatic expiration; the export supports
up to 10,000 dates and fails rather than silently truncating the archive.
The RSS contains the latest 30 available reports.

### Production setup

1. Set GitHub repository variable `DEVPULSE_SITE_URL` to the deployed site
   origin, such as `https://<your-worker>.<your-subdomain>.workers.dev`, without
   a path. RSS links and GUIDs use this absolute origin; keep it stable.
2. Generate a random token of at least 32 characters. Set the same value as
   Worker secret `REPORTS_TOKEN` and GitHub Actions secret `REPORTS_TOKEN`.
   Use the Cloudflare dashboard's Worker secrets settings to avoid pasting
   credentials into shell arguments. The API rejects missing/short tokens.
3. Add GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`. Grant the token only the required Workers deployment,
   KV, D1 provisioning and Workers AI permissions for the target account.
   Do not commit tokens or `.dev.vars`/`.env` files.
4. For the first deployment, run `pnpm run deploy:bootstrap` with `DEVPULSE_SITE_URL`
   set. This installs the AI binding, D1 binding and both Cron triggers. If
   necessary, deploy once to create the Worker before adding its secret.
5. Enable `.github/workflows/reports.yml` on the repository's default branch.
   Run **Publish daily reports** manually after the first report is generated.

The workflow runs at minute 15 of every hour: normal publication starts at
21:15 JST, and later runs recover failed builds/deployments and remove
withdrawn content. GitHub schedules may be delayed; this is not an exact
delivery-time guarantee. It fetches all saved reports, builds Rspress, checks
a dry-run, deploys, verifies the public feed matches the build, and only then
records publication in D1. A failure before deployment leaves the previous
site in place. A failure after deployment can safely repeat the workflow.
All production deploy workflows should share concurrency group
`devpulse-production` to avoid an older build replacing a newer one.

Subscribe at **`/rss/reports.xml`** (RSS 2.0). Articles appear at
`/reports/YYYY-MM-DD/`, with an archive at `/reports/`. The home page and
archive show a visible RSS subscription button and advertise the feed through
`link rel="alternate"`. The home page displays the latest AI summary; the
archive displays that summary with project metrics and source links, so readers
can follow progress without an RSS reader. The Worker checks the latest report's
public visibility before serving these overview pages and temporarily returns
503 if they await republication.
RSS items contain a title, publication date, short plain-text summary (up to
180 characters) and a link to the report page. Full report HTML is not embedded
in the feed; readers follow the link to read the summary, metrics and sources.

### Repository priority

Set `priority` on each project in `src/data/devpulse/projects.json`, for example
`"priority": "highest"`. The dashboard displays projects in this order:
`highest` (最優先), `next` (次に着手), `later` (後回し), `unset` (未設定).
Omitting the field is equivalent to `unset`; ties keep the configuration file's
order. Invalid values fail configuration validation. Rebuild and deploy after
editing the file to publish the same order for all viewers. Priority is displayed
as a badge; it is configured only in the file.

### Local checks and manual recovery

Use an ignored `.dev.vars` file for the local Worker token. To call a deployed
API, securely set `DEVPULSE_SITE_URL` and `REPORTS_TOKEN` in your environment:

```bash
pnpm run reports:generate  # current target day only; explicitly resets exhausted attempts
pnpm run reports:fetch     # download saved, currently publishable reports
pnpm run build            # create Markdown articles and RSS
pnpm run deploy:check      # validate Worker without uploading
```

`reports:generate` can incur a Workers AI charge; local unit tests mock AI
and GitHub. A running generation returns HTTP 409. Fix the failure before
requesting a manual reset. To retry **publication only**, rerun the Actions
workflow: do not regenerate. `reports:ack` is reserved for a verified successful
deployment. The workflow verifies the exact generated feed before using it.

Generated Markdown, `.reports-cache/` and the feed manifest are ignored by
Git. `pnpm run deploy` always restores the archive first and fails if the
report API is unavailable. Do not use `deploy:bootstrap` or a direct
`cf deploy` on an existing archive without first fetching saved reports:
deploying a checkout without that cache publishes an empty archive.
Treat the cache as a temporary build input, never a backup.
Run `pnpm run test`, `pnpm run check`, `pnpm exec tsc --noEmit`,
`pnpm run format` and `pnpm run deploy:check` before publishing changes.

Structured Worker events `report_generated` and `report_generation_failed`
identify the target date; check them alongside `snapshot_sync_failed` and
GitHub Actions step results. D1 `daily_reports` records `attempts`,
`lease_until`, captured `input`, completed `report`, and deployment
`published_at`; a stored report without deployment acknowledgement needs
publication recovery, not another AI call.

### GitHub token

`GITHUB_TOKEN` raises the GitHub API rate limit for the hourly synchronization.
Create a fine-grained personal access token with **Public repositories (read-only)**
access and no extra permissions, and set an expiration of 90 days or less. Set it
as Worker secret `GITHUB_TOKEN` in the Cloudflare dashboard (avoid shell arguments).
The Worker sends it only to `api.github.com`, never logs it, and still publishes
only repositories whose `visibility` is `public`.

To renew before expiry: generate a new token with the same scope, replace the
Worker secret, then trigger a sync and confirm `snapshot_sync_completed` has
`failures: 0` in the logs. Calendar a reminder a week before expiry; an expired
token causes HTTP 401 failures (last snapshots are kept for up to 48 hours).
Without the secret the Worker falls back to unauthenticated requests.

### Public scope and withdrawal

Only configured `published: true` projects with public, non-expired GitHub
snapshots enter AI input and publication. If any repository included in a
past report is removed or becomes private, the entire report is omitted on
the next build (including its summary). The Worker also stops serving that
article and temporarily returns 503 for an affected RSS until it is rebuilt.
Visibility is observed during GitHub synchronization; a transient GitHub
failure can retain previously public data for up to 48 hours. Set
`published: false` and deploy for an explicit immediate opt-out.

Static client chunks, search indexes and copies already downloaded by RSS
readers cannot be recalled. A complete site rebuild removes withdrawn text
from the published build; this feed is for information safe to publish,
not access-controlled private reporting. The source records remain in D1
for recovery and require an explicit administrator action to erase.

## Setup

Install the dependencies:

```bash
npm install
```

## Get started

Start the dev server:

```bash
npm run dev
```

Build the website for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```
