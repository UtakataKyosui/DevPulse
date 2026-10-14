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
DEVPULSE_PROJECTS_FIXTURE=src/data/devpulse/projects.sample.json pnpm run build
pnpm run preview
```

For static-only development, use `DEVPULSE_API_URL='' pnpm run dev`.

## Agent development

See [AGENTS.md](AGENTS.md) for validation rules and the
[DevPulse development skill](.agents/skills/devpulse-development/SKILL.md)
for local builds and task-specific guidance.
