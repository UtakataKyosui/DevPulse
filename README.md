# Rspress website

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
