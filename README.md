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

## 詳細ドキュメント

- [UIコンポーネント](documentation/ja/ui.md)：shadcn/uiとTailwind CSS
- [デプロイ](documentation/ja/deployment.md)：Cloudflare Workersへの初回・通常デプロイ
- [管理者認証](documentation/ja/authentication.md)：Cloudflare Accessの設定とローカル開発
- [プロジェクト設定](documentation/ja/projects.md)：追加、履歴、復元、反映遅延、優先度
- [管理者API](documentation/ja/admin-api.md)：エンドポイントと検証ルール
- [進捗同期](documentation/ja/synchronization.md)：毎時同期とGitHubトークン
- [日次レポートとRSS](documentation/ja/reports.md)：生成の仕組みと本番設定
- [レポートの運用](documentation/ja/report-operations.md)：手動復旧と公開の取り下げ

## チェック

```bash
pnpm run test
pnpm run check
pnpm exec tsc --noEmit
pnpm run format
```

デプロイ前の検証手順と必要な環境変数は、[デプロイ](documentation/ja/deployment.md)と
[レポートの運用](documentation/ja/report-operations.md)を参照してください。
