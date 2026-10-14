# shadcn/ui

[README](../../../../README.md) | [開発スキル](../SKILL.md)

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

## 管理画面（`/admin`）

管理画面は公開サイトとは別に、`src/admin/`のReactアプリとして実装しています。
`src/components/ui/`のshadcn/uiコンポーネントを共有しますが、スタイルは
`src/admin/admin.css`（shadcn neutralのテーマ変数、Preflight込み、OSのダークモードに追従）を使います。

- `pnpm run admin:build`（`scripts/build-admin.ts`）がesbuildとTailwind CLIでJSとCSSを生成し、
  git管理外の`src/worker/admin/generated.ts`に文字列として書き出します。`test`と`build`が先に実行します。
- Workerは認可後にだけ`/admin/app.js`と`/admin/app.css`を配信します。公開ビルドには含めません。
- CSPは`style-src 'self' 'nonce-…'`です。nonceはレスポンスごとに変わり、Radix（`react-remove-scroll`）が
  ダイアログ表示中に挿入する`<style>`に`src/admin/nonce.ts`経由で付きます。`'unsafe-inline'`は使いません。
- 選択肢が多いフォームのセレクトは、CSPとテストのしやすさから`native-select`を使います。
- 公開サイトのナビゲーションにある「管理画面」リンクは、`theme/index.tsx`の`afterNavMenu`にある通常の`<a href="/admin">`です。
  クライアントルーターを通さずWorkerに到達させるためで、ログインはCloudflare Accessが要求します。
  `rspress dev`（:8080）はWorkerを動かさないため、このリンク先は開けません。
