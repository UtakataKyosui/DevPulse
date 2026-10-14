# 初回セットアップチェックリスト

[README](../../../../README.md) | [開発スキル](../SKILL.md)

以下の作業には本番環境へのアクセスが必要です。項目7と8以外はコードだけでは設定されません。
各項目の詳細はリンク先を参照してください。Workerがまだ存在しない場合は、
[初回デプロイ](reports.md#本番環境の設定)で作成してからWorkerのシークレットを設定します。
Accessで保護する本番ドメインを用意し、`DEVPULSE_SITE_URL`にはそのオリジンを指定してください。

## 本番の設定項目

| # | 設定先 | 名前 | 値・取得方法 | 未設定時の挙動 |
|---|---|---|---|---|
| 1 | GitHub変数 | `DEVPULSE_SITE_URL` | デプロイ先のオリジン。パスなし（[本番設定](reports.md#本番環境の設定)） | ビルドとレポート取得が失敗し、デプロイされない |
| 2 | GitHubシークレット | `CLOUDFLARE_API_TOKEN` | Workers、KV、D1、Workers AIに必要な権限だけを持つAPIトークン。**`reports.yml`で必須** | デプロイのステップが失敗する |
| 3 | GitHubシークレット | `CLOUDFLARE_ACCOUNT_ID` | CloudflareアカウントID | デプロイのステップが失敗する |
| 4 | GitHubとWorkerのシークレット | `REPORTS_TOKEN` | 両方に同じ32文字以上のランダムな文字列。`pnpm run setup:secrets`で生成して両方に登録できる（Workerを作成した後に実行する） | レポートAPIがリクエストを拒否し、`reports:fetch`が失敗する |
| 5 | Workerシークレット | `GITHUB_TOKEN` | 公開リポジトリの読み取り専用fine-grained PAT（[GitHubトークン](synchronization.md#githubトークン)） | `cf deploy`が「required secrets have not been set」で失敗し、デプロイされない |
| 6 | Cloudflare Zero Trust | Access Application | `/admin*`と`/api/admin/*`を保護するセルフホスト型アプリ（[Access設定](authentication.md#accessの設定)） | Accessがログインを要求せず、Workerの検証だけが防御になる |
| 7 | リポジトリシークレット | `ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com`。設定後にデプロイする | 空のままでは`/admin`と`/api/admin/*`が503を返す |
| 8 | リポジトリシークレット | `ACCESS_AUD` | Access ApplicationのAUDタグ。設定後にデプロイする | 空のままでは`/admin`と`/api/admin/*`が503を返す |
| 9 | Workerシークレット | `ADMIN_ALLOWED_EMAILS` | `/admin`で許可するメールアドレスのカンマ区切りリスト | `/admin`と`/api/admin/*`が503を返す |
| 10 | Cloudflareダッシュボード | `workers.dev`とPreview URLs | 無効化する（[設定手順](authentication.md#workersdevとプレビューurlの無効化)） | 保護されていないホスト名から到達できる |

シークレットは各サービスの設定画面で登録し、シェル引数やGitに含めないでください。

`pnpm run doctor`は項目1〜5と9の登録状況を、GitHubとWorkerから名前だけ取得して一覧表示します。
値は読み取りません。必須項目が欠けているか、確認できなかった（`UNKNOWN`）場合は終了コード1で終了します。
事前に`gh auth login`とWranglerの認証が必要です。取得できなかった設定先は`UNKNOWN`と表示します。

## 必要な権限

トークンには、下表の権限だけを付与します。権限名はCloudflareダッシュボードの表記です
（[API token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)）。

| 対象 | 用途 | 必要な権限 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN`（項目2） | `reports.yml`の`cf deploy`。Worker、KV、D1、Workers AIのバインディングを作成・更新する | アカウント権限：`Workers Scripts` Edit、`Workers KV Storage` Edit、`D1` Edit、`Workers AI` Edit。対象はこのアカウントだけに限定する |
| `GITHUB_TOKEN`（項目5） | 毎時同期で公開リポジトリのマイルストーン、Issue、コミットを読む | fine-grained PATのRepository accessを**Public repositories (read-only)**にし、権限は追加しない。有効期限は90日以内（[GitHubトークン](synchronization.md#githubトークン)） |
| `gh`の認証 | `setup:secrets`と`doctor`でリポジトリのシークレットと変数を操作する | `gh auth login`の既定のスコープ（`repo`）で足りる。fine-grained PATを使う場合はこのリポジトリに対する`Secrets`と`Variables`のRead and write（`doctor`だけならRead） |
| Wranglerの認証 | `setup:secrets`と`doctor`でWorkerのシークレットを操作する | `pnpm exec wrangler login`、または`CLOUDFLARE_API_TOKEN`に`Workers Scripts` Edit（`doctor`だけならRead）。OAuthのスコープ不足の警告が出た場合は`wrangler login`をやり直す |
| Accessの設定（項目6） | Zero Trustで管理画面を保護するアプリを作る | Cloudflareアカウントの管理者としてダッシュボードで操作する。デプロイ用トークンには付与しない |

`CLOUDFLARE_API_TOKEN`に`Account Settings` Readが必要かは確認していません。
権限不足でデプロイが失敗した場合は、エラーに表示される権限を追加してこの表を更新してください。
`REPORTS_TOKEN`と`ADMIN_ALLOWED_EMAILS`に外部サービスの権限はありません。

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
2. `pnpm run config:seed --remote --namespace-id <id>`で`CONFIG` KV名前空間に初期データを投入します。
3. `GET /api/projects`で設定を確認し、**Publish daily reports**ワークフローを実行します。レポートの初回公開は[本番設定](reports.md#本番環境の設定)に従ってください。
4. [未認証アクセスの確認](authentication.md#未認証アクセスが拒否されることの確認)を実行します。
