# shadcn/ui

[README](../../../../README.md) | [開発スキル](../SKILL.md)

Tailwind CSS v4をRsbuildプラグイン経由で統合しています。`components.json`で
shadcn/uiの基本コンポーネントの配置先を`src/components/ui/`に設定しています。
ダッシュボードのカード、バッジ、進捗表示、通知にこれらのコンポーネントを使っています。
プロジェクト詳細では、マイルストーンと最近クローズしたIssueにTable、日別のIssueクローズ数に
Chart（Recharts）を使っています。TSX/MDXでは`@/components/ui/button`や
`@/components/ui/badge`からインポートしてください。コンポーネントは次のコマンドで追加できます。

```bash
pnpm dlx shadcn@latest add card
```

`tailwind.css`は色をRspressのテーマ変数に対応付け、`.dark`クラスに従います。
ドキュメントのテーマを維持するため、Tailwind Preflightは読み込んでいません。
