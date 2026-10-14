import { CLIENT_SCRIPT } from './client-script.ts';

const HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>DevPulse 管理</title>
<link rel="stylesheet" href="/admin/app.css">
</head>
<body>
<header>
  <h1>DevPulse 管理</h1>
  <p id="meta" class="muted"></p>
</header>
<main>
  <section class="notice" aria-label="反映タイミング">
    <p><strong>即時反映:</strong> API・同期・Home ダッシュボード(保存後、KV の反映遅延を除きすぐ)</p>
    <p><strong>次回ビルドで反映:</strong> サイドバー・プロジェクト詳細ページ(毎時の公開ビルド)</p>
  </section>
  <div id="banner" class="banner hidden" role="status"></div>
  <div class="toolbar">
    <button id="save-btn" type="button" disabled>変更を保存…</button>
    <button id="reload-btn" type="button">再読み込み</button>
    <span id="dirty" class="muted" aria-live="polite"></span>
  </div>
  <div id="tiers"></div>
  <section class="tier">
    <h2>リポジトリを追加</h2>
    <div id="candidates"></div>
  </section>
  <section class="tier" aria-labelledby="history-title">
    <h2 id="history-title">変更履歴</h2>
    <p id="history-note" class="muted"></p>
    <ol id="history" class="history"></ol>
  </section>
</main>
<dialog id="diff-dialog" aria-labelledby="diff-title">
  <h2 id="diff-title">保存する変更</h2>
  <ul id="diff-list"></ul>
  <div class="toolbar">
    <button id="diff-confirm" type="button">この内容で保存</button>
    <button id="diff-cancel" type="button">キャンセル</button>
  </div>
</dialog>
<dialog id="restore-dialog" aria-labelledby="restore-title">
  <h2 id="restore-title"></h2>
  <p id="restore-note"></p>
  <ul id="restore-errors" class="error"></ul>
  <ul id="restore-diff"></ul>
  <div class="toolbar">
    <button id="restore-confirm" type="button">この内容で復元</button>
    <button id="restore-cancel" type="button">キャンセル</button>
  </div>
</dialog>
<script src="/admin/app.js"></script>
</body>
</html>
`;

const CSS = `
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; padding: 0 1rem 4rem; max-width: 60rem; margin-inline: auto; line-height: 1.5; }
.muted { color: GrayText; font-size: .85rem; margin: 0; }
.notice { border: 1px solid GrayText; border-radius: .5rem; padding: .25rem 1rem; margin: 1rem 0; }
.notice p { margin: .5rem 0; }
.banner { display: flex; gap: .75rem; align-items: center; padding: .6rem 1rem; border-radius: .5rem; margin: 1rem 0; border: 1px solid; }
.banner.hidden { display: none; }
.banner.ok { border-color: green; }
.banner.warn { border-color: orange; }
.banner.error { border-color: crimson; }
.toolbar { display: flex; gap: .5rem; align-items: center; margin: 1rem 0; position: sticky; top: 0; background: Canvas; padding: .5rem 0; z-index: 1; }
.cards { list-style: none; padding: 0; margin: 0; display: grid; gap: .75rem; }
.card { border: 1px solid GrayText; border-radius: .5rem; padding: .75rem 1rem; }
.card.unpublished { opacity: .8; border-style: dashed; }
.card.has-error { border-color: crimson; }
.card.drop { outline: 2px solid Highlight; }
.card-head { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; }
.grip { cursor: grab; color: GrayText; }
.title { display: flex; flex-direction: column; flex: 1; min-width: 12rem; }
.repo { color: GrayText; font-size: .85rem; }
.badges { display: flex; gap: .25rem; flex-wrap: wrap; }
.badge { border: 1px solid GrayText; border-radius: 1rem; padding: 0 .5rem; font-size: .75rem; }
.badge.on { border-color: green; }
.badge.warn { border-color: orange; }
.badge.new { border-color: Highlight; }
.controls { display: flex; gap: 1rem; flex-wrap: wrap; align-items: end; margin: .5rem 0; }
.field { display: flex; flex-direction: column; gap: .15rem; margin: .5rem 0; }
.field .label { font-size: .8rem; color: GrayText; }
.field.invalid input, .field.invalid select, .field.invalid textarea { border-color: crimson; }
.error { color: crimson; font-size: .85rem; }
.check { display: flex; gap: .4rem; align-items: center; }
.danger { color: crimson; }
.empty { color: GrayText; }
button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 3px solid Highlight; outline-offset: 2px; }
dialog { max-width: 40rem; }
.history { padding-left: 1.5rem; }
.history-item { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; margin: .35rem 0; }
`;

const NO_STORE = 'no-store';

/**
 * 管理画面の静的ファイル。呼び出し側(index.ts)が adminGate を通した後にだけ呼ぶ。
 * 画面と JS は Worker のバンドルにのみ存在し、assets(公開ビルド)には含めない。
 */
export function serveAdminPage(request: Request): Response {
  const path = new URL(request.url).pathname.toLowerCase();
  const files: Record<string, { body: string; type: string }> = {
    '/admin': { body: HTML, type: 'text/html' },
    '/admin/': { body: HTML, type: 'text/html' },
    '/admin/index.html': { body: HTML, type: 'text/html' },
    '/admin/app.js': { body: CLIENT_SCRIPT, type: 'text/javascript' },
    '/admin/app.css': { body: CSS, type: 'text/css' },
  };
  const file = files[path];
  if (!file)
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': NO_STORE },
    });
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD', 'Cache-Control': NO_STORE },
    });
  return new Response(request.method === 'HEAD' ? null : file.body, {
    headers: {
      'Content-Type': `${file.type}; charset=utf-8`,
      'Cache-Control': NO_STORE,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
