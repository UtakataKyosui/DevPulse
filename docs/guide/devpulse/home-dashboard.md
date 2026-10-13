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

- 環境変数 `DEVPULSE_API_URL` を設定してビルドすると、ブラウザが `GET {DEVPULSE_API_URL}/snapshots`(Cloudflare Worker の読み取り専用 API、レスポンスは `{ "snapshots": [...] }`)から公開 Snapshot を取得して表示を更新します。未設定の場合は `src/data/devpulse/*.json` の fixture だけで表示します(ローカル開発用)。
- 取得中は「取得しています」、失敗時は「取得できませんでした」を表示し、どちらもビルド時点のデータを表示し続けます。API が到達不能でもページは表示されます。
- Pages と Worker が別 origin の場合、Worker 側で Pages の origin だけに `Access-Control-Allow-Origin` を限定してください。同一 origin の `/api/*` として公開できるなら `DEVPULSE_API_URL=/api` を推奨します。
- ビルド出力は `doc_build/`(Cloudflare Pages の出力ディレクトリ、ビルドコマンドは `pnpm build`)です。Snapshot の同期で再ビルドは不要です。

## 未対応(今後)

Worker API 自体(#7)と、詳細ページ `/projects/:slug/` の実体(#6)は別 Issue で対応します。カードのリンクは先行して `/projects/:slug/` を指します。
