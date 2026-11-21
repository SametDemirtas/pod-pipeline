import { escapeHtml } from '../shared/escape-html.js';

export const PIN_WIDTH = 1000;
export const PIN_HEIGHT = 1500;

export interface PinLayout {
  /** The photo as a `data:` URL; the page may load nothing else. */
  readonly photo: string;
  /** Short words printed under the photo; empty for none. */
  readonly headline: string;
}

/** Longer headlines get smaller type, so they stay on at most three lines. */
function headlineSize(headline: string): number {
  const length = Array.from(headline).length;
  if (length <= 24) return 88;
  if (length <= 40) return 72;
  return 60;
}

/**
 * A tall pin as a self-contained page: the photo fills the frame, and a
 * headline, when there is one, sits on a light band at the bottom. Pinterest
 * favours 2:3 images, so the page is exactly 1000 × 1500 pixels.
 */
export function pinPage({ photo, headline }: PinLayout): string {
  const text = headline.trim();
  const band = text
    ? `<div class="band"><p style="font-size:${String(headlineSize(text))}px">${escapeHtml(text)}</p></div>`
    : '';
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<style>
html,body{margin:0;width:${String(PIN_WIDTH)}px;height:${String(PIN_HEIGHT)}px;overflow:hidden;background:#f6f3ee}
.frame{position:relative;width:100%;height:100%}
img{display:block;width:100%;height:100%;object-fit:cover}
.band{position:absolute;left:48px;right:48px;bottom:56px;padding:36px 44px;border-radius:28px;background:rgba(255,255,255,.92)}
p{margin:0;font:700 88px/1.1 -apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#1d1b19;text-align:center;overflow-wrap:anywhere}
</style></head>
<body><div class="frame"><img src="${escapeHtml(photo)}" alt="">${band}</div></body></html>`;
}
