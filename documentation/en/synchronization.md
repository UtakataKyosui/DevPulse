# Progress synchronization

[README](../../README.en.md) | [日本語](../ja/synchronization.md)

The `published` projects in the KV config (`config:projects:v1`) define the repositories. The Worker
reads it on every run, fetches their public GitHub milestones, closed issues and latest commits every
hour (`0 * * * *`, UTC), then writes normalized snapshots to Workers KV.
`GET /api/snapshots` and `GET /api/projects` (tier order) read the config per request. A missing config stops the sync with an error and yields 503, never a fixture. Reports use the config at generation time; past reports are unchanged.
`cf deploy` provisions the `SNAPSHOTS` namespace and installs the Cron Trigger.

GitHub requests are authenticated with the Worker secret `GITHUB_TOKEN` (see
[GitHub token](synchronization.md#github-token)). Transient
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
