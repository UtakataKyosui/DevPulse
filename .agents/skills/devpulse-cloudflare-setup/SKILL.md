---
name: devpulse-cloudflare-setup
description: DevPulseの本番Cloudflare環境を`cf`CLIでセットアップする。デプロイ用APIトークンの発行、Access Applicationとポリシーの作成、チームドメインとAUDの取得、Workerシークレットの登録を行うときに使う。
---

# DevPulseのCloudflareセットアップ

本番のCloudflareとGitHubの設定を`cf`、`gh`、`wrangler`で行う手順。
設定項目の一覧と未設定時の挙動は
[初回セットアップチェックリスト](../devpulse-development/references/setup-checklist.md)、
Accessの仕様は[管理者認証](../devpulse-development/references/authentication.md)を参照する。

## 原則

- 本番を変更するコマンドは、先に`--dry-run`でリクエストを確認し、ユーザーの承認を得てから実行する。
  読み取り（`get`、`list`、`whoami`、`pnpm run doctor`）は承認なしで実行してよい。
- 秘密の値（APIトークン、`REPORTS_TOKEN`、`ADMIN_ALLOWED_EMAILS`）は標準入力で渡す。
  コマンドの引数、ログ、Git管理下のファイルに含めない。`cf workers secrets update --text`は引数に値が載るため使わない。
- `cf`のサブコマンドは`--help`では引数が分からない。`cf cli search "<やりたいこと>"`でコマンドを探し、
  `cf schema <コマンド>`でパスとボディのフィールドを確認する。検索語に名前、メールアドレス、ID、トークンを含めない。

## 0. 現状の確認

```bash
cf auth whoami          # 認証方式と、操作できるアカウントを確認
pnpm run doctor         # 登録済みの項目を一覧（MISSINGが未登録）
```

アカウントIDは`whoami`の出力から取得する。`cf`は認証プロファイルのアカウントを既定で使うため、
複数のアカウントがある場合は`--profile`で対象を明示する。

## 1. デプロイ用APIトークン（`CLOUDFLARE_API_TOKEN`）

必要な権限は[必要な権限](../devpulse-development/references/setup-checklist.md#必要な権限)を参照する。
APIの権限名は、ダッシュボードの`Edit`が`Write`になる。

`cf auth login`のOAuth認証では、`permission-groups list`が403（`Unauthorized to access requested resource`）になることを確認している。
その場合はトークンの作成も同様に拒否される可能性が高く、手順の末尾にあるダッシュボードでの作成を使う。
トークンの作成権限を持つAPIトークンで`cf`を認証した場合は、以下の手順を実行できる。

1. 権限グループのIDを取得する。`Workers Scripts Write`、`Workers KV Storage Write`、`D1 Write`、`Workers AI Write`の4つを選ぶ。

   ```bash
   cf accounts tokens permission-groups list
   ```

2. `--dry-run`でリクエストを確認する。`policies`はこのアカウントだけを対象にする。

   ```bash
   cf accounts tokens create --name devpulse-deploy --dry-run --policies '[{"effect":"allow","permission_groups":[{"id":"<scripts-id>"},{"id":"<kv-id>"},{"id":"<d1-id>"},{"id":"<ai-id>"}],"resources":{"com.cloudflare.api.account.<account-id>":"*"}}]'
   ```

3. 承認後に`--dry-run`を外して実行する。レスポンスにトークンの値が含まれるため、端末に表示しない。
   出力を権限`600`の一時ファイルに保存し、`jq`でキー名だけ確認して値のフィールドを特定する。
   値は`jq -r`で取り出し、標準入力で`gh secret set CLOUDFLARE_API_TOKEN`に渡す。一時ファイルは削除する。

4. `pnpm run doctor`で`CLOUDFLARE_API_TOKEN`が`OK`になることを確認する。

ダッシュボードで作成する場合は、My Profile > API Tokensで上記4つの権限を付けたトークンを作成する。
値は一度しか表示されないため、画面から直接`gh secret set CLOUDFLARE_API_TOKEN`の入力プロンプトに貼り付け、シェルの引数や履歴に残さない。

## 2. 許可するメールアドレス（`ADMIN_ALLOWED_EMAILS`）

Workerのシークレットに登録する。GitHubのシークレットはデプロイ時にしか見えず、Workerから参照できない。
値は標準入力で渡す。複数人を許可する場合はカンマ区切りの1つの文字列にする。
Accessのポリシーとは別の許可リストで、両方を通らないと`/admin`に入れないため、同じメールアドレスにする。

```bash
printf '%s' '<owner-email>' | pnpm exec wrangler secret put ADMIN_ALLOWED_EMAILS --name devpulse
```

登録後に`pnpm run doctor`で`ADMIN_ALLOWED_EMAILS`が`OK`になることを確認する。
Wranglerのスコープ不足の警告が出た場合は`pnpm exec wrangler login`をやり直す。
登録だけでは`/admin`は開かず、手順3で`ACCESS_SETTINGS`を埋めてデプロイするまで503を返す。

## 3. Access（管理画面の保護）

公式ドキュメントでは、パス指定のセルフホスト型アプリのドメインはアカウントのアクティブなゾーンに属する必要があるとされる。
`DEVPULSE_SITE_URL`が`*.workers.dev`の場合でも、`destinations`を作成するAPIは受け付けられることを確認している
（実際に保護されるかはデプロイ後の確認が必要）。保護されない場合は、カスタムドメインを割り当てる。
`DEVPULSE_SITE_URL`を変えるとRSSのリンクとGUIDが変わる点に注意する
（[本番環境の設定](../devpulse-development/references/reports.md#本番環境の設定)）。
`type: "worker"`の`destinations`はWorker全体を保護するため、公開ページとRSSも認証が必要になる。使わない。

1. チームドメインを取得する。レスポンスの`auth_domain`が`<team>.cloudflareaccess.com`になる。

   ```bash
   cf zero-trust organization get
   ```

   Zero Trustの組織がまだない場合は、ダッシュボードで初回のオンボーディングを行う。

2. `cf zero-trust identity-providers list`で登録済みのログイン方法を確認する。ワンタイムPIN（`onetimepin`）だけが
   登録されている場合は、秘密の値を使わずにそのまま利用できる。GitHubを使う場合は、GitHub OAuth Appの
   Client Secretが引数に載らないよう、ダッシュボードで登録する。

3. 所有者のメールアドレスだけを許可する再利用可能なポリシーを作成する。作成後にポリシーのIDを控える。

   ```bash
   cf zero-trust access policies create --dry-run --name "DevPulse owner" --decision allow --include '[{"email":{"email":"<owner-email>"}}]'
   ```

4. Access Applicationを作成する。`destinations`には本番ホスト名の`/admin*`と`/api/admin/*`を指定する。
   `<policy-id>`は手順3で控えたID。レスポンスの`aud`がAUDタグになる。

   ```bash
   cf zero-trust access applications create --dry-run --body '{"name":"DevPulse Admin","type":"self_hosted","destinations":[{"type":"public","uri":"<production-host>/admin*"},{"type":"public","uri":"<production-host>/api/admin/*"}],"policies":[{"id":"<policy-id>"}]}'
   ```

   `*.workers.dev`のホスト名でも、パス指定の`destinations`を持つアプリの作成はAPIに受け付けられる。
   ただし未認証アクセスがログインへリダイレクトされるかは、デプロイ後に確認する。
   ポリシーを後から付ける場合は、`applications update <app-id>`を使う。`app-id`は位置引数で、
   リクエストはPUTのため`name`と`destinations`も含めて全体を渡す。

5. `cloudflare.config.ts`の`ACCESS_SETTINGS`に、チームドメインを`teamDomain`、AUDを`aud`として記載する。
   コミットしてデプロイする（`reports.yml`を実行する）。

6. `workers.dev`とPreview URLsを無効化する。この操作に対応する`cf`コマンドは見つかっていないため、
   [設定手順](../devpulse-development/references/authentication.md#workersdevとプレビューurlの無効化)に従い、ダッシュボードで行う。

## 4. 検証

1. `pnpm run doctor`で必須項目に`MISSING`がないことを確認する。
2. [未認証アクセスの確認](../devpulse-development/references/authentication.md#未認証アクセスが拒否されることの確認)を実行する。
3. `/admin`が503ではなくAccessのログインにリダイレクトされることを確認する。

## 失敗したとき

| 症状 | 確認すること |
|---|---|
| `/admin`が503のまま | `ACCESS_SETTINGS`の`teamDomain`と`aud`が空でないか。デプロイ後か。`ADMIN_ALLOWED_EMAILS`が登録されているか |
| `/admin`が403 | `aud`がApplicationのAUDと一致しているか。許可リストのメールアドレスがログインしたアカウントと一致しているか |
| トークンの作成が権限エラー | 作成に使う認証の権限。ダッシュボードで作成する |
| デプロイが権限エラー | エラーに表示された権限をトークンに追加し、チェックリストの[必要な権限](../devpulse-development/references/setup-checklist.md#必要な権限)の表を更新する |
