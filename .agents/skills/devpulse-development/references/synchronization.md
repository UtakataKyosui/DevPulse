# 進捗の同期

[README](../../../../README.md) | [開発スキル](../SKILL.md)

KV設定（`config:projects:v1`）の`published`なプロジェクトが同期対象のリポジトリを定義します。
Workerは実行のたびに設定を読み込み、毎時07分・37分（`7,37 * * * *`、UTC）の30分間隔で、公開GitHubマイルストーン、
クローズしたIssue、最新コミットを取得し、正規化したスナップショットをWorkers KVに書き込みます。
`GET /api/snapshots`と`GET /api/projects`（tier順）はリクエストごとに設定を読み込みます。
設定がなければ同期はエラーで停止し、APIは503を返します。フィクスチャは使用しません。
レポートは生成時の設定を使い、過去のレポートは変更しません。
`cf deploy`が`SNAPSHOTS`名前空間を作成し、Cron Triggerを設定します。
Cronの起動は遅延・欠落することがあるため、厳密な30分更新は保証しません。鮮度はスナップショットの
`fetchedAt`と、全リポジトリの取得に成功した最後の時刻`lastSuccessAt`で判断します。

### 重複実行の抑制とレート制限

- 同期は`REPORTS`（D1）の`sync_lock`表のリースで排他制御します。Cron、日次レポート生成、手動実行のどれかが
  実行中なら、後から来た実行はGitHubを呼ばずに`busy`で終わります。リースは20分で失効します。
- GitHubが429、残量0の403、`Retry-After`付きの403を返したら再試行せず、同期全体を中断します。
  更新できなかったリポジトリは最後の成功データ（最大48時間）を保持し、ログに`snapshot_sync_rate_limited`
  （`retryAfterSeconds`、`resetAt`）を記録します。次のCronで再開します。

### 手動実行

GitHub Actionsの`Sync snapshots`ワークフロー（`workflow_dispatch`）が`POST /api/sync`を呼びます。
認証は`REPORTS_TOKEN`のBearerで、リポジトリ変数`DEVPULSE_SITE_URL`が宛先です。
応答は同期の結果で、`409`は別の同期が実行中、`503`はレート制限、`502`は一部のリポジトリの失敗です。
このワークフローはデプロイを行わず、サイトの再ビルドも起動しません。

GitHubリクエストにはWorkerシークレット`GITHUB_TOKEN`を使用します
（[GitHubトークン](synchronization.md#githubトークン)を参照）。一時的な失敗時は各リポジトリの最後に成功した
スナップショットを最大48時間保持します。404や非公開のリポジトリは削除します。
同期失敗やレート制限はWorkerログで確認してください。
`snapshots.json`はビルド時のフォールバックであり、ライブデータの保存先ではありません。

ローカルで試すには`pnpm run build`、`pnpm run dev:worker`を実行してから次を実行します。

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
