# レポートの運用と公開範囲

[README](../../README.md) | [English](../en/report-operations.md)

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
