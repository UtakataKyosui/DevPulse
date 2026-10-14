# 初回セットアップチェックリスト

[README](../../../../README.md) | [開発スキル](../SKILL.md)

以下の作業には本番環境へのアクセスが必要です。コードだけでは設定されません。
各項目の詳細はリンク先を参照してください。Workerがまだ存在しない場合は、
[初回デプロイ](reports.md#本番環境の設定)で作成してからWorkerのシークレットを設定します。
Accessで保護する本番ドメインを用意し、`DEVPULSE_SITE_URL`にはそのオリジンを指定してください。

## 本番の設定項目

| # | 設定先 | 名前 | 値・取得方法 | 未設定時の挙動 |
|---|---|---|---|---|
| 1 | GitHub変数 | `DEVPULSE_SITE_URL` | デプロイ先のオリジン。パスなし（[本番設定](reports.md#本番環境の設定)） | ビルドとレポート取得が失敗し、デプロイされない |
| 2 | GitHubシークレット | `CLOUDFLARE_API_TOKEN` | Workers、KV、D1、Workers AIに必要な権限だけを持つAPIトークン。**`reports.yml`で必須** | デプロイのステップが失敗する |
| 3 | GitHubシークレット | `CLOUDFLARE_ACCOUNT_ID` | CloudflareアカウントID | デプロイのステップが失敗する |
| 4 | GitHubとWorkerのシークレット | `REPORTS_TOKEN` | 両方に同じ32文字以上のランダムな文字列 | レポートAPIがリクエストを拒否し、`reports:fetch`が失敗する |
| 5 | Workerシークレット | `GITHUB_TOKEN` | 公開リポジトリの読み取り専用fine-grained PAT（[GitHubトークン](synchronization.md#githubトークン)） | 毎時同期が未認証のGitHubリクエストにフォールバックし、レート制限に達しやすくなる |
| 6 | Cloudflare Zero Trust | Access Application | `/admin*`と`/api/admin/*`を保護するセルフホスト型アプリ（[Access設定](authentication.md#accessの設定)） | Accessがログインを要求せず、Workerの検証だけが防御になる |
| 7 | Workerシークレット | `ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` | `/admin`と`/api/admin/*`が503を返す |
| 8 | Workerシークレット | `ACCESS_AUD` | Access ApplicationのAUDタグ | `/admin`と`/api/admin/*`が503を返す |
| 9 | Workerシークレット | `ADMIN_ALLOWED_EMAILS` | `/admin`で許可するメールアドレスのカンマ区切りリスト | `/admin`と`/api/admin/*`が503を返す |
| 10 | Cloudflareダッシュボード | `workers.dev`とPreview URLs | 無効化する（[設定手順](authentication.md#workersdevとプレビューurlの無効化)） | 保護されていないホスト名から到達できる |

シークレットは各サービスの設定画面で登録し、シェル引数やGitに含めないでください。

## ローカル開発のみで使う設定

本番には設定しません。

| 名前 | 設定先 | 用途 | 未設定時の挙動 |
|---|---|---|---|
| `ADMIN_AUTH_BYPASS` | `.dev.vars`（コミット禁止） | `1`を設定すると、ループバックのホストに限り管理画面の認証を省略する（[認証バイパス](authentication.md#ローカル開発時の認証バイパスと本番環境)） | Access JWTが必要になる |
| `DEVPULSE_API_URL` | 環境変数 | ビルドに埋め込むAPIの接続先。空文字にすると静的サイトのみで開発できる | `/api`を使う |
| `DEVPULSE_PROJECTS_FIXTURE` | 環境変数 | 本番のプロジェクト設定を取得せずにビルドするときのフィクスチャのパス（[ローカルビルド](../SKILL.md#ローカルビルド)） | 取得済みの`.projects-cache/config.json`が必要になる |
| `DEVPULSE_SITE_URL`と`REPORTS_TOKEN` | 環境変数 | `projects:fetch`、`reports:*`、`deploy`を手元から実行するとき（[レポート運用](report-operations.md#ローカルでの確認と手動復旧)） | スクリプトがエラーで終了する |

## データ投入と検証

1. [プロジェクト設定の本番移行](projects.md#本番環境の移行)に従い、設定の取得元がまだない場合はフィクスチャを明示して初回デプロイします。既存のレポートアーカイブがある環境では、先に保存済みレポートを取得してください。
2. `pnpm run config:seed -- --remote --namespace-id <id>`で`CONFIG` KV名前空間に初期データを投入します。
3. `GET /api/projects`で設定を確認し、**Publish daily reports**ワークフローを実行します。レポートの初回公開は[本番設定](reports.md#本番環境の設定)に従ってください。
4. [未認証アクセスの確認](authentication.md#未認証アクセスが拒否されることの確認)を実行します。
