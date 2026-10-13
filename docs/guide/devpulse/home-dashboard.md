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

## 未対応(今後)

Cloudflare Worker API からの取得(ロード中/通信失敗表示を含む)と、詳細ページ `/projects/:slug/` の実体は別 Issue(#7 / #6)で対応します。カードのリンクは先行して `/projects/:slug/` を指します。
