---
name: devpulse-development
description: Build and validate DevPulse locally, or locate its setup, deployment, authentication, synchronization, and report-operation guidance when changing this repository.
---

# DevPulse development

## Local build

Use Node.js 22.18 or later and pnpm. Install with
`pnpm install --frozen-lockfile`; start the site with `pnpm run dev`.
For static-only development, use `DEVPULSE_API_URL='' pnpm run dev`.

For a local production build without fetching live project configuration:

```bash
DEVPULSE_PROJECTS_FIXTURE=src/data/devpulse/projects.sample.json pnpm run build
pnpm run preview
```

The fixture must be explicit: the build otherwise expects fetched configuration
in `.projects-cache/config.json`. Do not add an automatic sample-data fallback.
Follow the validation rules in the repository's `AGENTS.md`.

## Read the relevant project guide

The topic guides previously under `documentation/` live in `references/`.
Read only the guides relevant to the task. Japanese counterparts have the same
filenames under `references/ja/`; keep both languages aligned when updating them.

- [Setup checklist](references/en/setup-checklist.md): initial tokens, secrets,
  authentication, and data setup. [日本語](references/ja/setup-checklist.md)
- [UI](references/en/ui.md): shadcn/ui and Tailwind CSS conventions.
  [日本語](references/ja/ui.md)
- [Deployment](references/en/deployment.md): initial deployment, regular
  deployment, and validation. [日本語](references/ja/deployment.md)
- [Authentication](references/en/authentication.md): Cloudflare Access and local
  admin development. [日本語](references/ja/authentication.md)
- [Projects](references/en/projects.md): configuration, history, rollback,
  propagation, and priorities. [日本語](references/ja/projects.md)
- [Admin API](references/en/admin-api.md): endpoints and validation rules.
  [日本語](references/ja/admin-api.md)
- [Synchronization](references/en/synchronization.md): hourly GitHub sync and
  token configuration. [日本語](references/ja/synchronization.md)
- [Reports](references/en/reports.md): daily reports, RSS, and production setup.
  [日本語](references/ja/reports.md)
- [Report operations](references/en/report-operations.md): recovery, publication,
  and withdrawal. [日本語](references/ja/report-operations.md)

Keep detailed implementation and operational guidance in these topic files.
Keep the README focused on the product and getting started, and put rules that
apply to all changes in `AGENTS.md`.

## Deployment validation

Read [Deployment](references/en/deployment.md) and
[Report operations](references/en/report-operations.md) (or their Japanese counterparts) before
validating deployment or report operations. They define required environment
variables and first-deployment prerequisites.

This project deploys through `cf deploy`; Wrangler is used internally for static
assets. Preserve the project's `cf` workflow when applying upstream Workers guidance.
Deployment, report generation, acknowledgements, and recovery can change remote
state. Reading this skill does not authorize those operations; follow the user's
authorization and repository approval rules.
