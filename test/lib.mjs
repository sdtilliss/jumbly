import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
export const { chromium, devices } = require('playwright');

const FONTS = process.env.WW_FONTS || '';     // optional: a node_modules dir holding @fontsource-variable/* for faithful screenshots
export async function start() {
  const extra = FONTS && existsSync(FONTS) ? { '/_fonts/': FONTS.replace(/\/?$/, '/') } : {};
  const s = await serve(0, extra);
  const browser = await chromium.launch();
  return { ...s, browser, async stop() { await browser.close(); s.srv.close(); } };
}
export async function fonts(context, base) {
  const f = base + '_fonts/@fontsource-variable/';
  await context.route('https://fonts.googleapis.com/**', r => FONTS ? r.fulfill({ contentType: 'text/css', body:
    `@font-face{font-family:"Bricolage Grotesque";font-weight:200 800;src:url(${f}bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2) format("woff2")}` +
    `@font-face{font-family:"Instrument Sans";font-weight:400 700;src:url(${f}instrument-sans/files/instrument-sans-latin-wght-normal.woff2) format("woff2")}` }) : r.abort());
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function check(cond, msg) { if (!cond) throw new Error('FAIL: ' + msg); console.log('  ok  ' + msg); }

/* Board helpers (read the live round through the page's debug handle). */
export const live = page => page.waitForFunction(() => window.__ww && window.__ww.G.live, null, { timeout: 15000 });
export const state = page => page.evaluate(() => { const G = window.__ww.G; return { live: G.live, found: G.found.slice(), score: G.score, size: G.size, board: G.board.join(''), total: G.all.size }; });
export const words = (page, filter) => page.evaluate(f => { const G = window.__ww.G, out = []; for (const [w, p] of G.all) out.push({ w, p }); return out; }, filter);
export async function center(page, i) {
  return page.evaluate(i => { const t = document.querySelectorAll('#tiles .tile')[i].getBoundingClientRect(); return { x: t.left + t.width / 2, y: t.top + t.height / 2 }; }, i);
}
export async function swipe(page, path, steps = 4) {
  const pts = []; for (const i of path) pts.push(await center(page, i));
  await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down();
  for (let k = 1; k < pts.length; k++) await page.mouse.move(pts[k].x, pts[k].y, { steps });
  await page.mouse.up();
}
/* A path that is NOT a word: first non-word 3-tile walk. */
export const nonWord = page => page.evaluate(() => {
  const { G, Core } = window.__ww, nb = Core.neighbors(G.size);
  for (let a = 0; a < G.board.length; a++) for (const b of nb[a]) for (const c of nb[b]) if (c !== a && !Core.isWord(Core.wordOf(G.board, [a, b, c]))) return [a, b, c];
  return null;
});
