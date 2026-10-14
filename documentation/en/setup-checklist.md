# First-time setup checklist

[README](../../README.en.md) | [日本語](../ja/setup-checklist.md)

These tasks require production access and are not performed by the code.
Follow the links for details. If the Worker does not exist yet, create it with
an [initial deployment](reports.md#production-setup) before setting its secrets.
Prepare a production domain protected by Access and use its origin for `DEVPULSE_SITE_URL`.

| # | Where | Name | Value / how to get it |
|---|---|---|---|
| 1 | GitHub variable | `DEVPULSE_SITE_URL` | Deployed site origin, no path ([Production setup](reports.md#production-setup)) |
| 2 | GitHub secret | `CLOUDFLARE_API_TOKEN` | API token with only the required Workers, KV, D1 and Workers AI permissions; **required by `reports.yml`** |
| 3 | GitHub secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| 4 | GitHub secret and Worker secret | `REPORTS_TOKEN` | Same random string of 32+ characters in both places |
| 5 | Worker secret | `GITHUB_TOKEN` | Fine-grained PAT, public repositories read-only ([GitHub token](synchronization.md#github-token)) |
| 6 | Cloudflare Zero Trust | Access Application | Self-hosted app for `/admin*` and `/api/admin/*` ([Access setup](authentication.md#access-setup)) |
| 7 | Worker secret | `ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` |
| 8 | Worker secret | `ACCESS_AUD` | AUD tag of the Access Application |
| 9 | Worker secret | `ADMIN_ALLOWED_EMAILS` | Comma-separated emails allowed on `/admin` |
| 10 | Cloudflare dashboard | `workers.dev` and Preview URLs | Disable them ([Instructions](authentication.md#disable-workersdev-and-preview-urls)) |

Set secrets through each service's settings. Do not put them in shell arguments or Git.

## Seed data and verify

1. Follow [Production migration](projects.md#production-migration). Explicitly select a fixture for the initial deployment if the config API does not exist yet. If a report archive already exists, fetch saved reports before deploying.
2. Seed the `CONFIG` KV namespace: `pnpm run config:seed -- --remote --namespace-id <id>`.
3. Verify `GET /api/projects`, then run the **Publish daily reports** workflow. Follow [Production setup](reports.md#production-setup) for the first report publication.
4. Run the [unauthenticated-access checks](authentication.md#verify-that-unauthenticated-access-is-blocked).

Without items 7 to 9, `/admin` answers 503 (fail closed). Without item 5, the
hourly sync falls back to unauthenticated GitHub requests and is more likely to hit the rate limit.
