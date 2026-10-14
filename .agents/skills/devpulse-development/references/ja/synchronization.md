# 進捗の同期

[README](../../../../../README.md) | [English](../en/synchronization.md)

KV設定（`config:projects:v1`）の`published`なプロジェクトが同期対象のリポジトリを定義します。
Workerは実行のたびに設定を読み込み、毎時（`0 * * * *`、UTC）、公開GitHubマイルストーン、
クローズしたIssue、最新コミットを取得し、正規化したスナップショットをWorkers KVに書き込みます。
`GET /api/snapshots`と`GET /api/projects`（tier順）はリクエストごとに設定を読み込みます。
設定がなければ同期はエラーで停止し、APIは503を返します。フィクスチャは使用しません。
レポートは生成時の設定を使い、過去のレポートは変更しません。
`cf deploy`が`SNAPSHOTS`名前空間を作成し、Cron Triggerを設定します。

GitHubリクエストにはWorkerシークレット`GITHUB_TOKEN`を使用します
（[GitHubトークン](synchronization.md#githubトークン)を参照）。一時的な失敗時は各リポジトリの最後に成功した
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
