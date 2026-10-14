# Development and validation

- Use Node.js 22.18 or later and pnpm.
- Run `pnpm run check` for linting. This command also writes fixes; inspect the diff.
- Run `pnpm run format` for formatting and inspect the diff for unrelated changes.
- Run relevant tests with `pnpm run test`; type-check TypeScript changes with
  `pnpm exec tsc --noEmit`.
- Documentation-only changes need link and Markdown checks; runtime tests are
  unnecessary unless executable examples or application behavior change.
- Follow the DevPulse development skill for local builds and deployment
  validation. Read only the references relevant to the task.
