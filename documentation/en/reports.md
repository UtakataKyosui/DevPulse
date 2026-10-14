# Daily AI reports and RSS

[README](../../README.en.md) | [日本語](../ja/reports.md)

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
