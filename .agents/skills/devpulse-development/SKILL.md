---
name: devpulse-development
description: DevPulseのローカルビルドと検証、およびこのリポジトリのセットアップ、デプロイ、認証、同期、レポート運用に関する開発手順を参照する。
---

# DevPulseの開発

## ローカルビルド

Node.js 22.18以降とpnpmを使用する。`pnpm install --frozen-lockfile`で
依存関係をインストールし、`pnpm run dev`でサイトを起動する。
静的サイトのみで開発する場合は`DEVPULSE_API_URL='' pnpm run dev`を使う。

本番のプロジェクト設定を取得せずにローカルで本番用ビルドを確認する場合：

```bash
DEVPULSE_PROJECTS_FIXTURE=src/data/devpulse/projects.sample.json pnpm run build
pnpm run preview
```

フィクスチャは明示的に指定する。指定しなければビルドは取得済みの
`.projects-cache/config.json`を必要とする。サンプルデータへの自動フォールバックを追加しない。
検証にはリポジトリの`AGENTS.md`にある共通ルールを適用する。

## 作業に応じた参照資料

詳細資料は言語別に分けず、日本語で`references/`に配置する。
作業に関係する資料だけを読む。

- [初回セットアップ](references/setup-checklist.md)：トークン、シークレット、認証、データ投入。
  `cf`CLIで実行する手順は[devpulse-cloudflare-setup](../devpulse-cloudflare-setup/SKILL.md)を使う。
- [UI](references/ui.md)：shadcn/uiとTailwind CSSの実装方針。
- [デプロイ](references/deployment.md)：初回・通常デプロイと検証。
- [管理者認証](references/authentication.md)：Cloudflare Accessとローカル管理画面の開発。
- [プロジェクト設定](references/projects.md)：設定、履歴、復元、反映遅延、優先度。
- [管理者API](references/admin-api.md)：エンドポイントと検証ルール。
- [進捗同期](references/synchronization.md)：毎時のGitHub同期とトークン設定。
- [日次レポートとRSS](references/reports.md)：生成、RSS、本番設定。
- [レポート運用](references/report-operations.md)：復旧、公開、公開の取り下げ。

実装・運用の詳細は各資料にまとめる。READMEは概要と開発開始の案内に絞り、
すべての変更に適用するルールは`AGENTS.md`から参照できるようにする。

## デプロイの検証

デプロイやレポート運用を検証する前に、[デプロイ](references/deployment.md)と
[レポート運用](references/report-operations.md)を読み、必要な環境変数と初回設定の前提を確認する。

このプロジェクトは`cf deploy`でデプロイし、静的アセットの処理には内部でWranglerを使う。
公式Workersスキルの指針を適用する際も、この`cf`の手順を維持する。
デプロイ、レポート生成、公開確認の記録、復旧はリモートの状態を変更する場合がある。
スキルを読むだけでは実行は許可されない。ユーザーの指示とリポジトリの承認ルールに従う。
