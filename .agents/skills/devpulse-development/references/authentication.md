# 管理者認証（Cloudflare Access）

[README](../../../../README.md) | [開発スキル](../SKILL.md)

`/admin*`と`/api/admin/*`はCloudflare Access ApplicationとWorker側の検証
（`src/worker/admin-auth.ts`）で二重に保護しています。Workerは
`Cf-Access-Jwt-Assertion`を検証します（チームのJWKS
`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`によるRS256署名、
`aud`、`exp`、`nbf`、`iss`）。その後、`email`クレームを許可リストと照合します。
これは`REPORTS_TOKEN`とは独立しており、CIのBearerトークンで管理者アクセスはできません。
トークンなし・不正・期限切れは401、`aud`の不一致・メールアドレスが許可されていない場合は403、
Access設定が不足している場合は503を返し、アクセスを拒否します。

チームドメインとAUDタグは`cloudflare.config.ts`の`ACCESS_SETTINGS`に記載します。
許可するメールアドレスはWorkerシークレットで、ダッシュボードで設定し、シェル引数には指定しないでください。

| 設定 | 値 |
|---|---|
| `ACCESS_SETTINGS.teamDomain` | `<team>.cloudflareaccess.com`などのチームドメイン |
| `ACCESS_SETTINGS.aud` | Access ApplicationのApplication Audience（AUD）タグ |
| `ADMIN_ALLOWED_EMAILS`（シークレット） | 許可するメールアドレスのカンマ区切りリスト（このプロジェクトでは1件） |

### Accessの設定

1. Zero Trust > Access > Applicationsで、セルフホスト型アプリケーションを追加し、本番ドメインの公開ホスト名・パスとして`/admin*`と`/api/admin/*`を設定します。
2. ログイン方法にGitHubを追加し、所有者のメールアドレスだけを許可するポリシーを設定します。
3. ApplicationのAUDタグとチームドメインを`ACCESS_SETTINGS`に設定してデプロイし、許可するメールアドレスを`ADMIN_ALLOWED_EMAILS`シークレットに設定します。
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
