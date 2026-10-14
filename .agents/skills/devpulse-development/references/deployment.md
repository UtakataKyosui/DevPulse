# Cloudflare Workersへのデプロイ

[README](../../../../README.md) | [開発スキル](../SKILL.md)

Node.js 22.18以降とpnpmを使用してください。`pnpm install --frozen-lockfile`で
依存関係をインストールし、ログインしてデプロイします。

```bash
cf auth login
pnpm run deploy:bootstrap # 初回デプロイのみ。reports.mdの本番環境の設定を参照
```

`pnpm run deploy`は保存済みレポートを復元し、Rspressを`apps/web/doc_build/`にビルドして、
`cf`でデプロイします。`DEVPULSE_SITE_URL`と`REPORTS_TOKEN`が必要です。
レポートAPIがまだ存在しない初回デプロイに限り、`deploy:bootstrap`を使用してください。
アップロードせずに検証するには`pnpm run deploy:check`を実行します。
Worker名は`apps/worker/cloudflare.config.ts`の`devpulse`です。

静的アセットのビルドでは`cf`が内部でWranglerを使用しますが、デプロイコマンドは
`cf deploy`です。`apps/worker/wrangler.config.ts`にはアセットのディレクトリを指定しているため、
Cloudflare設定とともに維持してください。これらの設定ファイルがあれば`cf init`は不要です。
