# 初回セットアップチェックリスト

[README](../../../../README.md) | [開発スキル](../SKILL.md)

以下の作業には本番環境へのアクセスが必要です。コードだけでは設定されません。
各項目の詳細はリンク先を参照してください。Workerがまだ存在しない場合は、
[初回デプロイ](reports.md#本番環境の設定)で作成してからWorkerのシークレットを設定します。
Accessで保護する本番ドメインを用意し、`DEVPULSE_SITE_URL`にはそのオリジンを指定してください。

| # | 設定先 | 名前 | 値・取得方法 |
|---|---|---|---|
| 1 | GitHub変数 | `DEVPULSE_SITE_URL` | デプロイ先のオリジン。パスなし（[本番設定](reports.md#本番環境の設定)） |
| 2 | GitHubシークレット | `CLOUDFLARE_API_TOKEN` | Workers、KV、D1、Workers AIに必要な権限だけを持つAPIトークン。**`reports.yml`で必須** |
| 3 | GitHubシークレット | `CLOUDFLARE_ACCOUNT_ID` | CloudflareアカウントID |
| 4 | GitHubとWorkerのシークレット | `REPORTS_TOKEN` | 両方に同じ32文字以上のランダムな文字列 |
| 5 | Workerシークレット | `GITHUB_TOKEN` | 公開リポジトリの読み取り専用fine-grained PAT（[GitHubトークン](synchronization.md#githubトークン)） |
| 6 | Cloudflare Zero Trust | Access Application | `/admin*`と`/api/admin/*`を保護するセルフホスト型アプリ（[Access設定](authentication.md#accessの設定)） |
| 7 | Workerシークレット | `ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` |
| 8 | Workerシークレット | `ACCESS_AUD` | Access ApplicationのAUDタグ |
| 9 | Workerシークレット | `ADMIN_ALLOWED_EMAILS` | `/admin`で許可するメールアドレスのカンマ区切りリスト |
| 10 | Cloudflareダッシュボード | `workers.dev`とPreview URLs | 無効化する（[設定手順](authentication.md#workersdevとプレビューurlの無効化)） |

シークレットは各サービスの設定画面で登録し、シェル引数やGitに含めないでください。

## データ投入と検証

1. [プロジェクト設定の本番移行](projects.md#本番環境の移行)に従い、設定の取得元がまだない場合はフィクスチャを明示して初回デプロイします。既存のレポートアーカイブがある環境では、先に保存済みレポートを取得してください。
2. `pnpm run config:seed -- --remote --namespace-id <id>`で`CONFIG` KV名前空間に初期データを投入します。
3. `GET /api/projects`で設定を確認し、**Publish daily reports**ワークフローを実行します。レポートの初回公開は[本番設定](reports.md#本番環境の設定)に従ってください。
4. [未認証アクセスの確認](authentication.md#未認証アクセスが拒否されることの確認)を実行します。

項目7〜9がなければ`/admin`は503を返してアクセスを拒否します。
項目5がなければ毎時同期は未認証のGitHubリクエストにフォールバックし、レート制限に達しやすくなります。
