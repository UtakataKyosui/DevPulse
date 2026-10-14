# Admin API

[README](../../../../../README.en.md) | [日本語](../ja/admin-api.md)

All endpoints sit behind the Access gate (`src/worker/admin-api.ts`) and return
`Cache-Control: no-store`. `POST` / `PUT` / `DELETE` additionally require an
`Origin` header equal to the request origin.

| Endpoint | Behavior |
|---|---|
| `GET /api/admin/config` | Current `{ revision, updatedAt, updatedBy, projects }` |
| `PUT /api/admin/config` | Body `{ revision, projects }`. 409 when `revision` is stale; 422 with `errors: [{ path, message }]` for schema errors, slug changes, and repositories that are not public |
| `GET /api/admin/candidates` | Public repositories of the fixed owner that are not registered yet, each with `defaults` (`published: false`, `tier: low`) |
| `GET /api/admin/history` | `{ revision, limit, entries: [{ revision, updatedAt, updatedBy, projectCount }] }` for the retained replaced revisions, newest first |
| `GET /api/admin/history/<revision>` | That revision's stored document plus `errors` from `projectConfigSchema` and the slug rule against the current config. 404 when no longer retained |
| `POST /api/admin/history/<revision>/restore` | Body `{ revision }` = the **current** revision. Saves that revision's projects as a new revision with the same checks as `PUT` (409 stale, 422 invalid or not public, 404 not retained) |

The owner is `ADMIN_SETTINGS.githubOwner` in `cloudflare.config.ts`. On save,
repositories that are newly added or newly published are checked against the
GitHub API with `GITHUB_TOKEN`; newly added ones must belong to that owner.
Restores go through the same check, so a revision that re-publishes a
repository which has since gone private is rejected.
