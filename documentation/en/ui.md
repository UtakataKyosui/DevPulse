# shadcn/ui

[README](../../README.en.md) | [日本語](../ja/ui.md)

Tailwind CSS v4 is integrated through the Rsbuild plugin. `components.json`
configures shadcn/ui primitives in `src/components/ui/`. Dashboard cards, badges,
progress indicators and notices use these components. Project details use Table
for milestones and recent closures, and Chart (Recharts) for daily Issue closures.
Import them using `@/components/ui/button` or `@/components/ui/badge` in TSX/MDX.
Add more components with:

```bash
pnpm dlx shadcn@latest add card
```

`tailwind.css` maps colors to Rspress theme variables and follows its `.dark`
class. Tailwind Preflight is omitted to preserve the documentation theme.
