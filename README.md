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
DEVPULSE_PROJECTS_FIXTURE=packages/domain/fixtures/projects.sample.json pnpm run build
pnpm run preview
```

静的サイトのみで開発する場合は、`DEVPULSE_API_URL='' pnpm run dev`を使用します。

## エージェントによる開発

変更時の検証ルールは [AGENTS.md](AGENTS.md)、ローカルビルドと作業別の手順は
[DevPulse開発スキル](.agents/skills/devpulse-development/SKILL.md)を参照してください。

## リポジトリの構成

pnpm workspaceでアプリと共通パッケージを分けています。コマンドはリポジトリのルートで実行します。

| パス | 役割 |
| --- | --- |
| `apps/web` | Rspressの公開サイト。設定は閲覧専用 |
| `apps/admin` | React + Base UIの管理画面。設定の編集・履歴・復元 |
| `apps/worker` | 公開・管理API、認証、GitHub同期、日次レポート |
| `packages/domain` | 共通の型、設定スキーマ、進捗・Health・レポートの計算 |
| `packages/ui` | 共通UIコンポーネント |

着手優先度などの設定は管理画面で編集し、CONFIG KVに保存します。
各アプリは共通パッケージを`workspace:*`で参照します。公開サイトと認証付き管理画面は同じWorkerから配信します。

`pnpm run dev`は公開サイト、`pnpm run dev:worker`はWorkerを起動します。
管理画面のローカル認証と初期データ投入は[開発スキル](.agents/skills/devpulse-development/SKILL.md)を参照してください。
管理画面のアセットを変更したら`pnpm run admin:build`で再生成します。

検証は`pnpm run test`、`pnpm run typecheck`、`pnpm run check`、`pnpm run format`を使います。
`pnpm run build`は管理画面を先にビルドし、公開サイトを`apps/web/doc_build/`に生成します。
`pnpm run deploy`は本番の設定と保存済みレポートを取得してから全体を公開します。
