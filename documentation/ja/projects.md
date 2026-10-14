# プロジェクト設定ストア

[README](../../README.md) | [English](../en/projects.md)

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
過去のリビジョンを新しいリビジョンとして復元できます（[管理者API](admin-api.md)を参照）。
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


### リポジトリの優先度

プロジェクトは`tier`（`high` / `medium` / `low`）と設定内の順序でグループ化・並び替えします。
どちらも`/admin`で編集できます。ダッシュボードではさらに`priority`
（`highest`（最優先）、`next`（次に着手）、`later`（後回し）、`unset`（未設定））でカードを並び替え、
同じ優先度では設定の順序を維持します。閲覧者はダッシュボードでプロジェクトごとに設定でき、
そのブラウザの`localStorage`だけに保存します。CONFIG KVのプロジェクトにある任意の`priority`は、
閲覧者が選択する前のデフォルト値です。管理画面では編集しません。
