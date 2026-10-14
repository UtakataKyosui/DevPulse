# DevPulse

日本語 | [English](README.en.md)

## shadcn/ui

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

## Cloudflare Workersへのデプロイ

Node.js 22.18以降とpnpmを使用してください。`pnpm install --frozen-lockfile`で
依存関係をインストールし、ログインしてデプロイします。

```bash
cf auth login
pnpm run deploy:bootstrap # 初回デプロイのみ。後述の日次レポートの設定を参照
```

`pnpm run deploy`は保存済みレポートを復元し、Rspressを`doc_build/`にビルドして、
`cf`でデプロイします。`DEVPULSE_SITE_URL`と`REPORTS_TOKEN`が必要です。
レポートAPIがまだ存在しない初回デプロイに限り、`deploy:bootstrap`を使用してください。
アップロードせずに検証するには`pnpm run deploy:check`を実行します。
Worker名は`cloudflare.config.ts`の`devpulse`です。

静的アセットのビルドでは`cf`が内部でWranglerを使用しますが、デプロイコマンドは
`cf deploy`です。`wrangler.config.ts`にはアセットのディレクトリを指定しているため、
Cloudflare設定とともに維持してください。これらの設定ファイルがあれば`cf init`は不要です。

## 管理者認証（Cloudflare Access）

`/admin*`と`/api/admin/*`はCloudflare Access ApplicationとWorker側の検証
（`src/worker/admin-auth.ts`）で二重に保護しています。Workerは
`Cf-Access-Jwt-Assertion`を検証します（チームのJWKS
`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`によるRS256署名、
`aud`、`exp`、`nbf`、`iss`）。その後、`email`クレームを許可リストと照合します。
これは`REPORTS_TOKEN`とは独立しており、CIのBearerトークンで管理者アクセスはできません。
トークンなし・不正・期限切れは401、`aud`の不一致・メールアドレスが許可されていない場合は403、
Access設定が不足している場合は503を返し、アクセスを拒否します。

Workerのシークレットはダッシュボードで設定し、シェル引数には指定しないでください。

| 名前 | 値 |
|---|---|
| `ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com`などのチームドメイン |
| `ACCESS_AUD` | Access ApplicationのApplication Audience（AUD）タグ |
| `ADMIN_ALLOWED_EMAILS` | 許可するメールアドレスのカンマ区切りリスト（このプロジェクトでは1件） |

### Accessの設定

1. Zero Trust > Access > Applicationsで、セルフホスト型アプリケーションを追加し、本番ドメインの公開ホスト名・パスとして`/admin*`と`/api/admin/*`を設定します。
2. ログイン方法にGitHubを追加し、所有者のメールアドレスだけを許可するポリシーを設定します。
3. ApplicationのAUDタグとチームドメインを上記のシークレットに設定します。
4. 料金とユーザー数：Cloudflare Zero Trustには少人数向けの無料プランがあります（前回確認時は50人）。現在の上限と料金はCloudflareダッシュボードで確認してください。**要確認**。

### `workers.dev`とプレビューURLの無効化

Accessは紐付けたホスト名だけを保護するため、保護されていない`workers.dev`と
プレビューURLを無効化する必要があります。Workers & Pages > devpulse > Settings >
Domains & Routesで**workers.dev**と**Preview URLs**を無効にしてください
（または、これらのホスト名も同じAccess Applicationで保護してください）。
Workerも有効なJWTのないリクエストを拒否しますが、Accessを最初の防御層にしてください。

### ローカル開発時の認証バイパスと本番環境

ローカル開発に限り、`.dev.vars`（コミット禁止）を作成し、`ADMIN_AUTH_BYPASS=1`を設定します。
バイパスが有効になるのは、変数が厳密に`1`で、リクエストのホストが`localhost`、
`127.0.0.1`、`[::1]`のいずれかの場合だけです。`cloudflare.config.ts`には宣言していないため、
デプロイ済みWorkerには存在しません。仮に設定しても、実際のホスト名へのリクエストには
有効なAccess JWTが必要です。本番環境では設定しないでください。

### 未認証アクセスが拒否されることの確認

本番ドメインと`workers.dev`のホスト名に対して次を実行してください。すべてのリクエストが
Accessログインへの302（Accessが返すもの）または401/403になり、アプリから200/404が返らないことを確認します。

```bash
for host in https://<production-host> https://devpulse.<subdomain>.workers.dev; do
  for path in /admin /admin/ /api/admin/projects; do
    curl -s -o /dev/null -w "$host$path %{http_code}\n" "$host$path"
  done
done
```

偽造ヘッダーでも認証を通過できないことを確認してください。
`curl -H 'Cf-Access-Jwt-Assertion: x.y.z'`は401を返す必要があります。
トークンなし、不正な署名、誤った`aud`、期限切れ、許可されていないメールアドレスの自動テストは
`pnpm test`（`src/worker/admin-auth.test.ts`）で実行します。
コード変更時にはCloudflareに対する実環境での確認は実施していません。

## プロジェクト設定ストア

プロジェクト一覧は`CONFIG` Workers KV名前空間のキー`config:projects:v1`に、
単一のJSONドキュメント`{ revision, updatedAt, updatedBy, projects }`として保存します。
毎時の同期で全体を上書きする`SNAPSHOTS`とは別の名前空間です。
`CONFIG`は手動で編集するデータを保持し、独立した管理（バックアップ、アクセス範囲、一覧取得）が必要です。
読み書きは`src/worker/config-store.ts`が行います。値が存在しない、または不正な場合はエラーとなり、
リポジトリ内のファイルにはフォールバックしません。書き込み時には`projectConfigSchema`で検証し、
id・slug・リポジトリの重複を拒否します。書き込み直前に再取得したリビジョンが呼び出し元の
期待するリビジョンと異なる場合も拒否します。KVにはcompare-and-swapがないため、
再取得から保存までの間に競合した2件の書き込みは検出できません。管理者が1人であることを前提としています。

初期の8プロジェクトをリビジョン1として一度だけ投入します（既存の値の上書きは拒否します）。
入力は`scripts/projects.seed.json`です。ファイルベースの設定を廃止した時点の本番一覧の
スナップショットで、初期投入スクリプトだけが読み込みます。テストとフィクスチャを使うビルドでは
`src/data/devpulse/projects.sample.json`を使用します。別の入力を使う場合は`--source <file>`を指定してください。

```bash
pnpm run config:seed                                            # ローカルのcf dev KV
pnpm run config:seed -- --remote --namespace-id <CONFIG namespace id>
```

ローカルの初期投入は、バインディング名を名前空間IDとして`.wrangler/state`配下に書き込みます。
本番のIDは`cf deploy`が`CONFIG`を作成した後、Cloudflareダッシュボードで確認してください。

### 履歴とロールバック

書き込みのたびに、置き換えるドキュメントを同じ名前空間の`config:projects:history:v1`に保存します。
履歴は新しい順のJSON配列で、置き換えられた直近20リビジョンを保持します。
現在のリビジョンは`config:projects:v1`にだけ存在します。初期投入では置き換えるデータがないため、
履歴キーには触れません。履歴は設定より先に書き込むため、設定の保存に失敗してもリビジョンは失われず、
再試行でも重複しません。上記のCASがないことによる競合は両方のキーに適用されます。
管理画面では履歴、現在の設定との差分、`projectConfigSchema`の検証結果を表示し、
過去のリビジョンを新しいリビジョンとして復元できます（[管理者API](#管理者api)を参照）。
古いリビジョンは削除されます。必要なら`wrangler kv key get config:projects:v1`で外部にバックアップしてください。

履歴の値が有効なJSONでない、または所定の配列でない場合、黙って破棄せず、
履歴エンドポイントと設定の書き込みの両方が503で失敗します。リセットするにはキーを削除します。
`pnpm exec wrangler kv key delete config:projects:history:v1 --namespace-id <id> --remote`

### 反映の遅延

[Workers KVのドキュメント](https://developers.cloudflare.com/kv/concepts/how-kv-works/)によると、
書き込みは通常、書き込んだ場所でのみ即座に参照できます。他の場所ではキャッシュされた値が返され、
変更が見えるまで最大60秒、またはそれ以上かかります。デフォルトの`cacheTtl`は60秒です。
キーが見つからない結果も同様にキャッシュされ、最近そのキーを読んだ場所ほど反映に時間がかかります。
ドキュメントには「それ以上」の上限が示されていないため、正確な最大値は**要確認**です。
約1分に、数値化できない余裕を加えて計画してください。

`CONFIG`を読み込む各利用先の遅延は次のとおりです。Worker（同期Cron、`/api/*`）は上記のKV遅延後に
変更を参照します。サイドバーと詳細ページは、次の毎時ビルド（`15 * * * *`）で設定を取得するまで待つため、
最大で約1時間にKV遅延とビルド時間が加わります。

### ビルド時のサイドバーと詳細ページ

`pnpm run projects:fetch`は`DEVPULSE_SITE_URL`の`GET /api/projects`
（公開API、トークン不要）から設定を取得し、`.projects-cache/config.json`に保存します。
`rspress.config.ts`は`docs/projects/_meta.json`を書き込み、手書きのMDXがない公開slugについて
テンプレートから`docs/projects/<slug>/index.mdx`を生成します（生成ファイルにはマーカーが付き、Gitの追跡対象外です）。
非公開または削除済みslugの手書きMDXは除外します。取得済み設定がなければビルドは非ゼロで終了し、
フィクスチャにはフォールバックしません。ローカルやPRのチェックで使う場合は明示的に指定してください。

```sh
DEVPULSE_PROJECTS_FIXTURE=src/data/devpulse/projects.sample.json pnpm run build
```

`reports.yml`はビルド前に設定を取得するため、取得失敗時はデプロイを停止します。
`deploy:bootstrap`と`deploy:check`でも設定の取得、またはフィクスチャ変数が必要です。
`docs/projects/_meta.json`はビルドのたびに書き換わります。フィクスチャの内容はコミットしないでください。

### プロジェクトの追加

1. Cloudflare Accessで保護された`/admin`を開き、候補一覧からリポジトリを選んで、名前、`tier`、`published`を設定して保存します。
2. APIとホームにはKVの反映遅延後に表示されます。サイドバーと`/projects/<slug>/`ページは次の毎時ビルド（`15 * * * *`）で表示されます。すぐにビルドするには**Publish daily reports**ワークフローを手動実行してください。詳細ページは自動生成されます。手書きする場合だけ`docs/projects/<slug>/index.mdx`を追加します。

### 本番環境の移行

次の順番で実行してください（コード変更時には未実施です。各手順には本番環境へのアクセスが必要です）。

1. `CONFIG`を読み込むWorkerをデプロイし（`cf deploy`で名前空間を作成）、ダッシュボードで名前空間IDを確認します。
2. `pnpm run config:seed -- --remote --namespace-id <id>`で初期データを投入します。
3. `GET /api/projects`が8プロジェクトを返すことを確認し、**Publish daily reports**ワークフローを実行してビルド時に取得します。
4. ホーム、サイドバー、詳細ページが移行前と同じ表示であることを確認します。`/admin`での変更がAPIとホームに即座に反映され、次のビルド後にサイドバーと詳細ページに反映されることも確認します。

### `cf dev`でのローカル管理画面

`cf dev`は`.dev.vars`の`ADMIN_AUTH_BYPASS`を読み込みません。
`pnpm run config:seed`の後、`pnpm exec wrangler dev --var ADMIN_AUTH_BYPASS:1`で
Workerを起動し、`http://localhost:8787/admin`を開いてください。

## 管理者API

すべてのエンドポイントはAccessによる認証（`src/worker/admin-api.ts`）で保護され、
`Cache-Control: no-store`を返します。`POST` / `PUT` / `DELETE`では、
リクエスト元のオリジンと一致する`Origin`ヘッダーも必要です。

| エンドポイント | 動作 |
|---|---|
| `GET /api/admin/config` | 現在の`{ revision, updatedAt, updatedBy, projects }`を返す |
| `PUT /api/admin/config` | 本文は`{ revision, projects }`。古い`revision`は409。スキーマエラー、slug変更、非公開リポジトリは422と`errors: [{ path, message }]`を返す |
| `GET /api/admin/candidates` | 固定の所有者の未登録の公開リポジトリを返す。各候補に`defaults`（`published: false`、`tier: low`）を含む |
| `GET /api/admin/history` | 保持している置き換え済みリビジョンを新しい順で`{ revision, limit, entries: [{ revision, updatedAt, updatedBy, projectCount }] }`として返す |
| `GET /api/admin/history/<revision>` | 指定リビジョンの保存済みドキュメントに、`projectConfigSchema`と現在の設定に対するslugルールの`errors`を加えて返す。保持されていなければ404 |
| `POST /api/admin/history/<revision>/restore` | 本文の`{ revision }`には**現在の**リビジョンを指定。指定した過去のリビジョンのプロジェクトを新しいリビジョンとして保存する。`PUT`と同じ検証を行う（古い場合409、不正または非公開なら422、保持されていなければ404） |

所有者は`cloudflare.config.ts`の`ADMIN_SETTINGS.githubOwner`で設定します。
保存時には、新規追加または新たに公開するリポジトリを`GITHUB_TOKEN`を使ってGitHub APIで確認します。
新規追加するリポジトリは、その所有者に属している必要があります。復元時も同じ検証を行うため、
その後非公開になったリポジトリを再公開するリビジョンは拒否されます。

## 進捗の同期

KV設定（`config:projects:v1`）の`published`なプロジェクトが同期対象のリポジトリを定義します。
Workerは実行のたびに設定を読み込み、毎時（`0 * * * *`、UTC）、公開GitHubマイルストーン、
クローズしたIssue、最新コミットを取得し、正規化したスナップショットをWorkers KVに書き込みます。
`GET /api/snapshots`と`GET /api/projects`（tier順）はリクエストごとに設定を読み込みます。
設定がなければ同期はエラーで停止し、APIは503を返します。フィクスチャは使用しません。
レポートは生成時の設定を使い、過去のレポートは変更しません。
`cf deploy`が`SNAPSHOTS`名前空間を作成し、Cron Triggerを設定します。

GitHubリクエストにはWorkerシークレット`GITHUB_TOKEN`を使用します
（[GitHubトークン](#githubトークン)を参照）。一時的な失敗時は各リポジトリの最後に成功した
スナップショットを最大48時間保持します。404や非公開のリポジトリは削除します。
同期失敗やレート制限はWorkerログで確認してください。
`snapshots.json`はビルド時のフォールバックであり、ライブデータの保存先ではありません。

ローカルで試すには`pnpm run build`、`pnpm exec cf dev`を実行してから次を実行します。

```bash
curl http://localhost:8787/cdn-cgi/local/scheduled
curl http://localhost:8787/api/snapshots
```

最初の同期が成功するまでAPIは503を返します。静的なRspressのみで開発する場合は、
`pnpm dev`の実行時に`DEVPULSE_API_URL=''`を設定してください。

## 日次AIレポートとRSS

Workerは**21:00 JST**（`0 12 * * *`、UTC）に、JSTでの前日分の日本語レポートを生成します。
Issueのクローズ数はPRを除外し、00:00以上、翌日00:00未満の半開区間で集計します。
マイルストーンの進捗、健全性、期限は、過去の日末時点ではなくデータ取得時点の状態を示します。
同じマイルストーンを連続して取得した場合だけ進捗差分を算出します。
更新失敗時は最大48時間前までのデータを、古いデータであることを明示して使用します。
データがない場合や初回取得時は差分を不明とします。

Workers AIはプレーンテキストの要約を作成し、確定的な集計値とソースリンクは別に表示します。
デフォルトモデルは`@cf/meta/llama-3.3-70b-instruct-fp8-fast`です。
`cloudflare.config.ts`の`REPORT_SETTINGS`でこのモデル、または
`@cf/meta/llama-3.1-8b-instruct`を選択し、`maxTokens`（100〜2000）や
`maxInputChars`（1000〜24000）を調整できます。プロンプトを変更する場合は、
レポート生成処理・スキーマのプロンプトバージョンを更新する必要があります。
本番の推論を有効にする前に、日本語出力とWorkers AIの現在の料金・利用可否を確認してください。
[モデルのドキュメント](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)

`REPORTS`は`cf`が作成するD1データベースです。Workerで冪等なテーブル初期化を行います。
日付の一意制約と、古い処理の書き込みを防ぐ10分間のリースで生成を直列化します。
1日につき最大3回自動試行し、22:00と23:00 JSTの毎時処理での復旧を含みます。
取得済み入力は推論に失敗しても保持し、完成したレポートではAIを再実行しません。
保存済みレポートのURL、GUID、公開日時、モデルのメタデータは再ビルドでも維持します。
D1のレポートと取得データには自動有効期限を設けていません。エクスポートは最大10,000日分に対応し、
上限を超えた場合はアーカイブを黙って切り捨てずに失敗します。RSSには最新の利用可能な30件を含めます。

### 本番環境の設定

1. GitHubリポジトリ変数`DEVPULSE_SITE_URL`に、デプロイ済みサイトのオリジン（例：`https://<your-worker>.<your-subdomain>.workers.dev`）をパスなしで設定します。RSSリンクとGUIDはこの絶対オリジンを使うため、変更しないようにしてください。
2. 32文字以上のランダムなトークンを生成し、Workerシークレット`REPORTS_TOKEN`とGitHub Actionsシークレット`REPORTS_TOKEN`に同じ値を設定します。認証情報をシェル引数に貼り付けないよう、CloudflareダッシュボードのWorkerシークレット設定を使用してください。APIは未設定または短いトークンを拒否します。
3. GitHub Actionsシークレット`CLOUDFLARE_API_TOKEN`と`CLOUDFLARE_ACCOUNT_ID`を追加します。トークンには対象アカウントのWorkersデプロイ、KV・D1の作成、Workers AIに必要な権限だけを付与してください。トークン、`.dev.vars`、`.env`ファイルはコミットしないでください。
4. 初回は`DEVPULSE_SITE_URL`を設定して`pnpm run deploy:bootstrap`を実行します。AIとD1のバインディング、および2つのCron Triggerを設定します。必要ならシークレットを追加する前に一度デプロイしてWorkerを作成してください。
5. リポジトリのデフォルトブランチで`.github/workflows/reports.yml`を有効にします。最初のレポート生成後に**Publish daily reports**を手動実行してください。

ワークフローは毎時15分に実行されます。通常の公開は21:15 JSTから始まり、
後続の実行でビルド・デプロイ失敗からの復旧や公開を取り下げたコンテンツの削除を行います。
GitHubのスケジュール実行は遅延することがあり、正確な配信時刻を保証するものではありません。
保存済みレポートをすべて取得してRspressをビルドし、ドライランを確認してからデプロイします。
公開フィードがビルドと一致することを検証した後に、D1に公開を記録します。
デプロイ前の失敗では既存サイトを維持します。デプロイ後の失敗では安全に再実行できます。
古いビルドが新しいものを置き換えないよう、本番デプロイのワークフローはすべて
同時実行グループ`devpulse-production`を共有してください。

購読先は**`/rss/reports.xml`**（RSS 2.0）です。記事は`/reports/YYYY-MM-DD/`、
アーカイブは`/reports/`にあります。ホームとアーカイブにはRSS購読ボタンを表示し、
`link rel="alternate"`でもフィードを案内します。ホームには最新のAI要約、
アーカイブには要約とプロジェクト指標・ソースリンクを表示するため、RSSリーダーなしでも進捗を追えます。
Workerはこれらの概要ページを返す前に最新レポートの公開可否を確認し、再公開待ちの場合は一時的に503を返します。
RSSの各項目にはタイトル、公開日時、短いプレーンテキストの要約（最大180文字）、記事へのリンクを含めます。
記事のHTML全体は埋め込みません。要約、指標、ソースはリンク先で確認してください。

### リポジトリの優先度

プロジェクトは`tier`（`high` / `medium` / `low`）と設定内の順序でグループ化・並び替えします。
どちらも`/admin`で編集できます。ダッシュボードではさらに`priority`
（`highest`（最優先）、`next`（次に着手）、`later`（後回し）、`unset`（未設定））でカードを並び替え、
同じ優先度では設定の順序を維持します。閲覧者はダッシュボードでプロジェクトごとに設定でき、
そのブラウザの`localStorage`だけに保存します。CONFIG KVのプロジェクトにある任意の`priority`は、
閲覧者が選択する前のデフォルト値です。管理画面では編集しません。

### ローカルでの確認と手動復旧

ローカルWorkerのトークンにはGitの追跡対象外の`.dev.vars`を使ってください。
デプロイ済みAPIを呼び出すには、環境変数`DEVPULSE_SITE_URL`と`REPORTS_TOKEN`を安全に設定します。

```bash
pnpm run reports:generate  # 現在の対象日のみ。試行回数を使い切った状態を明示的にリセット
pnpm run reports:fetch     # 保存済みで現在公開可能なレポートを取得
pnpm run build            # Markdown記事とRSSを生成
pnpm run deploy:check      # アップロードせずにWorkerを検証
```

`reports:generate`ではWorkers AIの料金が発生する場合があります。ローカルの単体テストでは
AIとGitHubをモック化しています。生成中の場合はHTTP 409を返します。
手動リセットの前に失敗原因を修正してください。**公開だけ**を再試行する場合はActionsワークフローを
再実行し、レポートは再生成しないでください。`reports:ack`はデプロイの成功を検証した後にだけ使用します。
ワークフローは、生成したフィードとの厳密な一致を確認してから実行します。

生成Markdown、`.reports-cache/`、フィードマニフェストはGitの追跡対象外です。
`pnpm run deploy`は必ず先にアーカイブを復元し、レポートAPIが利用できなければ失敗します。
既存アーカイブがある環境で、保存済みレポートを取得せずに`deploy:bootstrap`や直接の`cf deploy`を
実行しないでください。キャッシュのないチェックアウトをデプロイすると、空のアーカイブを公開してしまいます。
キャッシュは一時的なビルド入力であり、バックアップとして扱わないでください。
変更を公開する前に`pnpm run test`、`pnpm run check`、`pnpm exec tsc --noEmit`、
`pnpm run format`、`pnpm run deploy:check`を実行してください。

Workerの構造化イベント`report_generated`と`report_generation_failed`には対象日が含まれます。
`snapshot_sync_failed`やGitHub Actionsのステップ結果と合わせて確認してください。
D1の`daily_reports`には`attempts`、`lease_until`、取得済み`input`、完成した`report`、
デプロイ時の`published_at`を記録します。保存済みレポートのデプロイ確認が未記録の場合は、
AIを再度呼び出すのではなく公開処理を復旧してください。

### GitHubトークン

`GITHUB_TOKEN`は毎時同期のGitHub APIレート制限を引き上げます。
**Public repositories (read-only)**のアクセス権を持ち、追加権限のないfine-grained personal access tokenを
作成し、有効期限を90日以内に設定してください。CloudflareダッシュボードでWorkerシークレット
`GITHUB_TOKEN`として設定し、シェル引数には指定しないでください。
Workerはトークンを`api.github.com`にだけ送信し、ログには記録しません。
公開対象も`visibility`が`public`のリポジトリに限定します。

期限前に更新するには、同じ権限の新しいトークンを生成してWorkerシークレットを置き換え、
同期を実行し、ログの`snapshot_sync_completed`で`failures: 0`を確認します。
期限の1週間前にリマインダーを設定してください。期限切れではHTTP 401が発生し、
最後のスナップショットは最大48時間保持されます。シークレットがなければ未認証リクエストにフォールバックします。

### 公開範囲と公開の取り下げ

設定で`published: true`となっており、公開かつ有効期限内のGitHubスナップショットがある
プロジェクトだけをAI入力と公開対象に含めます。過去のレポートに含まれたリポジトリが削除または
非公開になった場合、次のビルドでそのレポート全体（要約を含む）を除外します。
Workerもその記事の配信を停止し、影響を受けるRSSには再ビルドまで一時的に503を返します。
公開可否はGitHub同期時に確認します。一時的なGitHub障害では、以前公開されていたデータを
最大48時間保持する場合があります。明示的に即座に公開を取り下げるには、
`published: false`に設定してデプロイしてください。

静的なクライアントチャンク、検索インデックス、RSSリーダーがダウンロード済みのコピーは回収できません。
サイト全体を再ビルドすると、公開ビルドから取り下げたテキストを削除します。
このフィードは公開してよい情報のためのもので、アクセス制御された非公開レポート用ではありません。
元のレコードは復旧用にD1に残り、削除するには管理者の明示的な操作が必要です。

## セットアップ

依存関係をインストールします。

```bash
pnpm install --frozen-lockfile
```

## 開発の開始

開発サーバーを起動します。

```bash
pnpm run dev
```

本番用にサイトをビルドします。

```bash
pnpm run build
```

本番ビルドをローカルでプレビューします。

```bash
pnpm run preview
```
