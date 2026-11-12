// Phone: real touch events (via CDP), fast swipes, no page scroll, layout at 4x4 / 6x6.
import { start, fonts, check, sleep, live, state, words, center, devices } from './lib.mjs';
const shots = process.env.WW_SHOTS || '';
const t = await start();
try {
  for (const scheme of ['light', 'dark']) {
    const ctx = await t.browser.newContext({ ...devices['iPhone 13'], colorScheme: scheme });
    await fonts(ctx, t.url);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })) });
    async function tswipe(path, perStep = 2, hold = false) {
      const pts = []; for (const i of path) pts.push(await center(page, i));
      await touch('touchStart', [pts[0]]);
      for (let k = 1; k < pts.length; k++) for (let j = 1; j <= perStep; j++)
        await touch('touchMove', [{ x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * j / perStep, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * j / perStep }]);
      if (!hold) await touch('touchEnd', []);
    }
    await page.goto(t.url + '?secs=20&net=local');
    await page.waitForFunction(() => window.__ww && window.__ww.Core.size() > 100000);
    if (shots) await page.screenshot({ path: `${shots}/home-phone-${scheme}.png` });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(await overflow() <= 0, `[${scheme}] home has no sideways scroll`);

    await page.tap(scheme === 'light' ? '[data-size="4"]' : '[data-size="6"]');
    await page.tap('#playSolo');
    await live(page);
    await sleep(550);
    const all = (await words(page)).sort((a, b) => b.w.length - a.w.length);
    const geom = await page.evaluate(() => { const b = document.querySelector('#board').getBoundingClientRect(), f = document.querySelector('.found').getBoundingClientRect(); return { bw: b.width, bb: b.bottom, ft: f.top, vh: innerHeight, vw: innerWidth, fb: f.bottom }; });
    check(geom.bb <= geom.ft + 1 && geom.fb <= geom.vh + 1, `[${scheme}] board (${geom.bw}px) and found list fit the screen`);

    // one-event-per-tile flick: the fastest possible swipe still catches every letter
    const w1 = all.find(x => x.w.length >= 5 && x.w.length <= 7);
    await tswipe(w1.p, 1);
    let s = await state(page);
    check(s.found.includes(w1.w), `[${scheme}] fast touch swipe "${w1.w}"`);
    // a second word, held mid-swipe for a screenshot
    const w2 = all.find(x => x.w.length === 5 && x.w !== w1.w) || all.find(x => x.w !== w1.w);
    await tswipe(w2.p, 3, true);
    await sleep(160);
    if (shots) await page.screenshot({ path: `${shots}/game-phone-${scheme}.png` });
    await touch('touchEnd', []);
    s = await state(page);
    check(s.found.includes(w2.w), `[${scheme}] second swipe "${w2.w}"`);
    for (const x of all.filter(x => !s.found.includes(x.w)).slice(3, 12)) await tswipe(x.p, 2);
    s = await state(page);
    check(s.found.length >= 10, `[${scheme}] ${s.found.length} words by touch`);
    check(await page.evaluate(() => scrollY) === 0 && await overflow() <= 0, `[${scheme}] page did not scroll while swiping`);
    await sleep(200);
    if (shots) await page.screenshot({ path: `${shots}/game-phone-${scheme}-idle.png` });
    await page.waitForSelector('#results:not([hidden])', { timeout: 25000 });
    await sleep(300);
    if (shots) await page.screenshot({ path: `${shots}/results-phone-${scheme}.png` });
    check(await overflow() <= 0, `[${scheme}] results have no sideways scroll`);
    check(errors.length === 0, `[${scheme}] no page errors ` + errors.join(' | '));
    await ctx.close();
  }
  console.log('PHONE OK');
} finally { await t.stop(); }
