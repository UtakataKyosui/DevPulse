import { ADMIN_CSS, ADMIN_JS } from '@devpulse/admin/bundle';

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
<div id="root"></div>
<noscript>管理画面には JavaScript が必要です。</noscript>
<script src="/admin/app.js"></script>
</body>
</html>
`;

const NO_STORE = 'no-store';

/**
 * 管理画面の静的ファイル。呼び出し側(index.ts)が adminGate を通した後にだけ呼ぶ。
 * 画面と JS は Worker のバンドルにのみ存在し、assets(公開ビルド)には含めない。
 */
export function serveAdminPage(request: Request): Response {
  const path = new URL(request.url).pathname.toLowerCase();
  const page = { body: HTML, type: 'text/html' };
  const files: Record<string, { body: string; type: string }> = {
    '/admin': page,
    '/admin/': page,
    '/admin/index.html': page,
    '/admin/app.js': { body: ADMIN_JS, type: 'text/javascript' },
    '/admin/app.css': { body: ADMIN_CSS, type: 'text/css' },
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
