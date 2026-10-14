# Deploy to Cloudflare Workers

[README](../../../../../README.en.md) | [日本語](../ja/deployment.md)

Use Node.js 22.18 or later and pnpm. Install dependencies with
`pnpm install --frozen-lockfile`, then sign in and deploy:

```bash
cf auth login
pnpm run deploy:bootstrap # first deployment only; see production setup in reports.md
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
