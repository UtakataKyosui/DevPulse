# DevPulse

[日本語](README.md) | English

An Rspress site for tracking GitHub project progress. Cloudflare Workers syncs
milestones, issues, and commits hourly and publishes Japanese daily AI reports
and an RSS feed.

## Get started

Use Node.js 22.18 or later and pnpm.

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

To check a production build locally, explicitly use the sample project config:

```bash
DEVPULSE_PROJECTS_FIXTURE=packages/domain/fixtures/projects.sample.json pnpm run build
pnpm run preview
```

For static-only development, use `DEVPULSE_API_URL='' pnpm run dev`.

## Agent development

See [AGENTS.md](AGENTS.md) for validation rules and the
[DevPulse development skill](.agents/skills/devpulse-development/SKILL.md)
for local builds and task-specific guidance.

## Repository layout

The pnpm workspace separates applications and shared packages. Run commands from the repository root.

| Path | Responsibility |
| --- | --- |
| `apps/web` | Rspress public site; project settings are read-only |
| `apps/admin` | React + Base UI settings editor, history and restore |
| `apps/worker` | Public/admin APIs, authentication, GitHub sync and daily reports |
| `packages/domain` | Shared types, schemas, progress, health and report calculations |
| `packages/ui` | Shared UI components |

Edit project settings, including work priority, in the admin console; CONFIG KV stores them.
Applications reference shared packages with `workspace:*`. One Worker still serves the public site and authenticated admin console.

Use `pnpm run dev` for the public site and `pnpm run dev:worker` for a Worker with local KV and D1.
The local Worker does not connect to remote AI.
See the [development skill](.agents/skills/devpulse-development/SKILL.md) for local admin authentication and seeding.
Rebuild admin assets with `pnpm run admin:build` after changing the admin UI.

Validate with `pnpm run test`, `pnpm run typecheck`, `pnpm run check` and `pnpm run format`.
`pnpm run build` builds the admin assets first, then the public site into `apps/web/doc_build/`.
`pnpm run deploy` fetches production configuration and saved reports before publishing.
