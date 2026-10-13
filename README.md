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
pnpm run deploy
```

`pnpm run deploy` builds Rspress into `doc_build/` and deploys it with `cf`.
To validate without uploading, run `pnpm run deploy:check`.
The Worker name is `devpulse` in `cloudflare.config.ts`.

The static assets build uses Wrangler internally through `cf`; the deployment
command remains `cf deploy`. Keep `wrangler.config.ts` alongside the Cloudflare
configuration, as it specifies the assets directory. No `cf init` is needed
once these configuration files exist.

## Progress synchronization

`src/data/devpulse/projects.json` defines the published repositories. The Worker
fetches their public GitHub milestones, closed issues and latest commits every
hour (`0 * * * *`, UTC), then writes normalized snapshots to Workers KV.
`GET /api/snapshots` serves KV data to the dashboard without rebuilding the site.
`cf deploy` provisions the `SNAPSHOTS` namespace and installs the Cron Trigger.

GitHub requests use the unauthenticated public API (no token required). Transient
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
