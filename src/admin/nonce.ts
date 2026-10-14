// Radix (react-remove-scroll) inserts a <style> element while a dialog is open.
// style-src only allows it when the element carries the per-response nonce.
const nonce = document
  .querySelector('meta[name="csp-nonce"]')
  ?.getAttribute('content');
if (nonce)
  (globalThis as { __webpack_nonce__?: string }).__webpack_nonce__ = nonce;
