# Home ダッシュボード

Home(`pageType: home`)の Hero 直下に、公開プロジェクトの状況を表示します。`features` の有無には依存しません。

## 仕組み

- `theme/index.tsx` が Rspress の `Layout` をラップし、`afterHero` スロットに `ProjectDashboard` を渡します。`afterHero` は Home のみで描画されるため、通常ドキュメントの Sidebar/TOC には影響しません。
- データはビルド時に `src/data/devpulse/*.json` を静的 import し、`buildProjectViews` で `ProjectView` に変換します。ブラウザから GitHub API は呼びません。
- 判定基準時刻 `now` は `rspress.config.ts` でビルド時に 1 度だけ決まり(`__DEVPULSE_BUILD_TIME__`)、SSG とクライアントで同一値になるため hydration 不整合は起きません。
- `ProjectView` から表示モデルへの変換は `src/components/devpulse/model.ts` の純粋関数です。

## 表示の読み方

- ゲージの **長さ** は Issue 消化率(Progress)、**色** は Activity Health です。別の指標なので「進捗 85% で停滞(赤)」も起こり得ます。
- 色だけに頼らず、`✓ 安定` `▲ 注意` `✕ 停滞` `? 不明` のアイコンとテキストを併記します。
- 進捗が算出できない場合は「—」を表示し、0% / 100% とは区別します。
- 休止・完了・アーカイブ・計画中は Health の評価対象外で、赤になりません。
- 「最終同期」はデータ取得時点、「最終Commit」はリモートの最新コミット日で、別の値です。同期が古い場合は警告を表示します。

## 最新データの取得とデプロイ

- ブラウザは同一 origin の `GET /api/projects`(公開プロジェクトの定義。表示順)と `GET /api/snapshots` を取得します。環境変数 `DEVPULSE_API_URL` で接続先を変更できます。
- 取得は Home の描画時だけ行い、通常のドキュメントページでは API を呼びません。
- プロジェクト定義は実行時に KV の設定から取得するため、設定で `published` を変更すると再ビルドなしで反映されます。
- 取得中は「取得しています」、失敗時は「取得できませんでした」を表示します。いずれの間もプロジェクトは表示されません。
- Cron Triggers が毎時 GitHub の公開リポジトリを取得して KV を更新します。取得失敗時は成功済みデータを最大48時間保持し、404・非公開リポジトリは除外します。エラーは Worker Logs で確認できます。
- ビルド出力は `doc_build/` です。`pnpm run deploy` が `cf` で静的ページ・Worker・KV・Cron を公開します。Snapshot の同期で再ビルドは不要です。

設定が KV に無い、または初回同期前の API は 503 を返します。GitHub API は認証なしで使用するため、レート制限で取得できなかった場合は次の毎時同期で再試行します。
