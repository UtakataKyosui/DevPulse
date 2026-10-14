# DevPulse agent guidance

## Validation

Read and follow [.claude/rules/validation.md](.claude/rules/validation.md)
for all changes. These shared rules are loaded automatically by Claude Code.

## Task-specific skills

The canonical project skills live in `.agents/skills/`. `.agent/skills` is an
alias for that directory, and `.claude/skills` links to `../.agent/skills`.
All three paths resolve to the same files, including bundled references.

- Read [devpulse-development](.agents/skills/devpulse-development/SKILL.md)
  for local builds, documentation routing, and deployment validation.
- Use the Rspress skills for site configuration, documentation, and descriptions.
- Use [workers-best-practices](.agents/skills/workers-best-practices/SKILL.md)
  for Worker code and configuration changes. This is the official Cloudflare skill.

## Official skill sources

- Existing Rspress skills: `rstackjs/agent-skills`; tracked in `skills-lock.json`.
- `workers-best-practices`: `cloudflare/skills`, path
  `skills/workers-best-practices`, pinned to commit
  `53395984c3ea1925d00fce03b266112302f050e6`.
  Keep its bundled references together and review upstream changes before updating.
