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

## Documentation

- [UI components](documentation/en/ui.md): shadcn/ui and Tailwind CSS
- [Deployment](documentation/en/deployment.md): initial and regular Cloudflare Workers deployments
- [Admin authentication](documentation/en/authentication.md): Cloudflare Access setup and local development
- [Project configuration](documentation/en/projects.md): adding projects, history, rollback, propagation, and priorities
- [Admin API](documentation/en/admin-api.md): endpoints and validation rules
- [Progress synchronization](documentation/en/synchronization.md): hourly sync and GitHub token
- [Daily reports and RSS](documentation/en/reports.md): generation and production setup
- [Report operations](documentation/en/report-operations.md): manual recovery and content withdrawal

## Checks

```bash
pnpm run test
pnpm run check
pnpm exec tsc --noEmit
pnpm run format
```

See [Deployment](documentation/en/deployment.md) and
[Report operations](documentation/en/report-operations.md) for deployment validation
and required environment variables.
