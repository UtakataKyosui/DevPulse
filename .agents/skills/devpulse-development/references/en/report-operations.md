# Report operations and public scope

[README](../../../../../README.en.md) | [日本語](../ja/report-operations.md)

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
