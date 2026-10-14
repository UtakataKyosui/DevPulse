# Project configuration store

[README](../../README.en.md) | [日本語](../ja/projects.md)

The project list is stored as one JSON document at key `config:projects:v1` in
the `CONFIG` Workers KV namespace: `{ revision, updatedAt, updatedBy, projects }`.
It is a separate namespace from `SNAPSHOTS` because the hourly sync overwrites
`SNAPSHOTS` wholesale, while `CONFIG` holds hand-edited data that needs its own
lifecycle (backup, access scoping, listing). `src/worker/config-store.ts` reads
and writes it. A missing or invalid value is an error; there is no fallback to
a repository file. Writes validate with `projectConfigSchema` (duplicate id, slug
and repository are rejected) and are refused when the revision re-read just
before the write differs from the caller's expected revision. KV has no
compare-and-swap, so two writes racing between that re-read and the put are not
detected; this relies on a single administrator.

Seed the initial 8 projects once, with revision 1 (it refuses to overwrite an
existing value). The input is `scripts/projects.seed.json`, a snapshot of the
production list taken when the file-based config was retired; it is only read by
the seed script, while tests and fixture builds use
`src/data/devpulse/projects.sample.json`. Pass `--source <file>` to seed
something else.

```bash
pnpm run config:seed                                            # local cf dev KV
pnpm run config:seed -- --remote --namespace-id <CONFIG namespace id>
```

The local seed writes under `.wrangler/state` using the binding name as the
namespace id. Find the production id in the Cloudflare dashboard after
`cf deploy` provisions `CONFIG`.

### History and rollback

Every write moves the document it replaces into `config:projects:history:v1`
(same namespace), a JSON array newest first, capped at the 20 most recent
replaced revisions; the current revision lives only in `config:projects:v1`.
The seed has nothing to replace and does not touch the history key. History is
written before the config, so a failed config put never loses a revision (a
retry does not duplicate it); the no-CAS race described above applies to both
keys. The admin page lists the history, shows the diff against the current
config and the `projectConfigSchema` result, and restores a revision as a new
revision (see [Admin API](admin-api.md)). Older revisions are gone; use
`wrangler kv key get config:projects:v1` for an off-site backup if needed.

A history value that is not valid JSON or not that array makes both the
history endpoints and config writes fail (503) rather than silently dropping
it. To reset, delete the key:
`pnpm exec wrangler kv key delete config:projects:history:v1 --namespace-id <id> --remote`.

### Propagation delay

Per the [Workers KV documentation](https://developers.cloudflare.com/kv/concepts/how-kv-works/),
a write is visible immediately (usually) only in the location where it was made.
Other locations serve cached values and see the change "up to 60 seconds or
more" later; the default `cacheTtl` is 60 seconds. Negative lookups (key not
found) are cached the same way, and locations that read the key recently take
longer. The documentation gives no upper bound beyond "or more", so the exact
maximum **requires verification**; plan for roughly one minute plus an unquantified margin.

Effective delay by consumer, once they read from `CONFIG`: Worker reads (sync
Cron, `/api/*`) see a change after the KV delay above; the sidebar and detail
pages also wait for the next hourly build (`15 * * * *`) to fetch the config,
so up to about one hour plus the KV delay and build time.

### Build-time sidebar and detail pages

`pnpm run projects:fetch` reads `GET /api/projects` from `DEVPULSE_SITE_URL`
(public, no token) into `.projects-cache/config.json`. `rspress.config.ts`
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

### Adding a project

1. Open `/admin` (behind Cloudflare Access), pick the repository from the
   candidates list, set its name, `tier` and `published`, and save.
2. The API and Home reflect it after the KV propagation delay. The sidebar and
   `/projects/<slug>/` page appear on the next hourly build (`15 * * * *`), or
   run the **Publish daily reports** workflow manually. A detail page is
   generated automatically; add `docs/projects/<slug>/index.mdx` only to
   hand-write one.

### Production migration

Do these in order (not performed by the code change; each needs production access):

1. Deploy the Worker that reads `CONFIG` (`cf deploy` provisions the
   namespace) and note the namespace id in the dashboard.
2. Seed: `pnpm run config:seed -- --remote --namespace-id <id>`.
3. Confirm `GET /api/projects` returns the 8 projects, then run the
   **Publish daily reports** workflow so the build fetches them.
4. Check that Home, the sidebar and the detail pages look the same as before,
   and that a change on `/admin` shows up in the API and Home immediately and in
   the sidebar and detail pages after the next build.

### Local admin with `cf dev`

`cf dev` does not pick up `ADMIN_AUTH_BYPASS` from `.dev.vars`. Run the Worker
with `pnpm exec wrangler dev --var ADMIN_AUTH_BYPASS:1` (after
`pnpm run config:seed`) and open `http://localhost:8787/admin`.


### Repository priority

Projects are grouped and ordered by `tier` (`high` / `medium` / `low`) and by
their order in the config; both are edited on `/admin`. The dashboard then sorts
cards by `priority` (`highest` (最優先), `next` (次に着手), `later` (後回し),
`unset` (未設定)); ties keep the config order. Each viewer sets this per
project in the dashboard, stored in that browser's `localStorage` only. The
optional `priority` field of a project in the CONFIG KV is just the default
shown before a viewer chooses one; the admin page does not edit it.
