# DevPulse

日本語 | [English](README.en.md)

GitHubプロジェクトの進捗を可視化するRspressサイトです。Cloudflare Workersで
マイルストーン、Issue、コミットを毎時同期し、日本語の日次AIレポートとRSSを公開します。

## 開発を始める

Node.js 22.18以降とpnpmを使用してください。

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

本番用ビルドをローカルで確認するには、サンプルのプロジェクト設定を明示します。

```bash
DEVPULSE_PROJECTS_FIXTURE=src/data/devpulse/projects.sample.json pnpm run build
pnpm run preview
```

静的サイトのみで開発する場合は、`DEVPULSE_API_URL='' pnpm run dev`を使用します。

## エージェントによる開発

変更時の検証ルールは [AGENTS.md](AGENTS.md)、ローカルビルドと作業別の手順は
[DevPulse開発スキル](.agents/skills/devpulse-development/SKILL.md)を参照してください。
