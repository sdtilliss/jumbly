// Edge cases: no-limit solo, Qu tiles by swipe and by keyboard, cancelled touches, abrupt opponent disconnect, desktop duel layout.
import { start, fonts, check, sleep, live, state, swipe, center, devices } from './lib.mjs';
const shots = process.env.WW_SHOTS || '';
const t = await start();
try {
  const ctx = await t.browser.newContext({ ...devices['iPhone 13'] });
  await fonts(ctx, t.url);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(t.url + '?net=local');
  await page.waitForFunction(() => window.__ww && window.__ww.Core.size() > 100000);
  await sleep(300);
  if (shots) await page.screenshot({ path: shots + '/x-home.png' });

  // no limit: starts at once, counts up, ends from the X button
  await page.tap('#homeSetup [data-i="5"]');
  check((await page.textContent('#homeSetup [data-v="time"]')) === 'No limit', 'no-limit option selectable');
  await page.tap('#playSolo');
  await live(page);
  check(await page.isHidden('#bar') && (await page.textContent('#time')) === '0:00', 'no-limit round has no countdown bar');
  // deal a fixed board with a Qu tile:  Q U I T / E A R S / L O N D / M P C H
  await page.evaluate(() => {
    const { G, Core } = window.__ww, b = 'quiteasrlondmpch'.split('');
    G.board.splice(0, 16, ...b);
    const sol = Core.solve(b, 4, 3); G.all.clear(); for (const [w, p] of sol) G.all.set(w, p);
    document.querySelectorAll('#tiles .tile').forEach((el, i) => { el.className = 'tile' + (b[i] === 'q' ? ' qu' : ''); el.firstChild.textContent = b[i] === 'q' ? 'Qu' : b[i].toUpperCase(); });
  });
  const has = w => page.evaluate(w => window.__ww.G.all.has(w), w);
  check(await has('quit') === false && await has('quite') === false, 'the U after Qu is not doubled (Q-U-I-T needs Qu then I, T)');
  const sol = await page.evaluate(() => [...window.__ww.G.all.keys()].filter(w => w.includes('q')));
  check(sol.length > 0, 'Qu words on the board: ' + sol.slice(0, 6).join(', '));
  const qw = sol.find(w => w.length >= 4) || sol[0];
  const qp = await page.evaluate(w => window.__ww.G.all.get(w), qw);
  await swipe(page, qp, 3);
  let s = await state(page);
  check(s.found.includes(qw) && s.score === 1 + ((qw.length - 3) * (qw.length - 2)) / 2, `swiped "${qw}" over the Qu tile, scored by letters (${s.score})`);
  const qw2 = sol.find(w => w !== qw);
  if (qw2) { await page.keyboard.type(qw2, { delay: 10 }); await page.keyboard.press('Enter'); check((await state(page)).found.includes(qw2), `typed "${qw2}" (typing Q then U works)`); }
  await sleep(1100);
  check(/^0:0[1-9]$/.test(await page.textContent('#time')), 'clock counts up');
  if (shots) await page.screenshot({ path: shots + '/x-nolimit.png' });

  // a cancelled touch drops the path without scoring
  const cdp = await ctx.newCDPSession(page);
  const any = await page.evaluate(() => { for (const [w, p] of window.__ww.G.all) if (!window.__ww.G.foundSet.has(w)) return p; });
  const pts = []; for (const i of any) pts.push(await center(page, i));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0].x, y: pts[0].y }] });
  for (const p of pts.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] });
  const before = (await state(page)).found.length;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  check((await state(page)).found.length === before && (await page.textContent('#word')) === '', 'cancelled touch scores nothing and clears');

  await page.tap('#quit');
  await page.waitForSelector('#results:not([hidden])', { timeout: 5000 });
  check((await page.textContent('#resKicker')).includes('no limit'), 'no-limit round ends from the X button');
  await page.tap('#resActions .btn:not(.primary)');

  // duel: countdown screenshot, then the guest's tab dies mid-round
  const guest = await ctx.newPage();
  await page.tap('#homeSetup [data-i="1"]');
  await page.tap('#playDuel'); await page.waitForSelector('#lobby:not([hidden])');
  const code = await page.evaluate(() => window.__ww.Duel.code());
  await sleep(400);
  if (shots) await page.screenshot({ path: shots + '/x-lobby.png' });
  await guest.goto(t.url + '?net=local#duel-' + code);
  await page.waitForFunction(() => !document.querySelector('#startDuel').disabled, null, { timeout: 8000 });
  await sleep(600);
  await page.tap('#startDuel');
  await page.waitForFunction(() => document.querySelector('#countNum').textContent === '2', null, { timeout: 8000 });
  if (shots) await page.screenshot({ path: shots + '/x-count.png' });
  await live(page);
  await guest.close();
  await page.waitForFunction(() => / left$/.test(document.querySelector('#rvName').textContent), null, { timeout: 12000 });
  check(true, 'host is told when the opponent\'s tab closes mid-round');
  check(errors.length === 0, 'no page errors ' + errors.join(' | '));

  // desktop duel results layout
  const dctx = await t.browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  await fonts(dctx, t.url);
  const a = await dctx.newPage(), b = await dctx.newPage();
  await a.goto(t.url + '?net=local&secs=7'); await a.waitForFunction(() => window.__ww && window.__ww.Core.size() > 100000);
  await a.click('#playDuel'); await a.waitForSelector('#lobby:not([hidden])');
  const c2 = await a.evaluate(() => window.__ww.Duel.code());
  await b.goto(t.url + '?net=local&secs=7#duel-' + c2);
  await a.waitForFunction(() => !document.querySelector('#startDuel').disabled, null, { timeout: 8000 });
  await sleep(500);
  if (shots) await a.screenshot({ path: shots + '/x-lobby-desktop.png' });
  await a.click('#startDuel');
  await Promise.all([live(a), live(b)]);
  await sleep(500);
  const ws = (await a.evaluate(() => [...window.__ww.G.all].map(([w, p]) => ({ w, p })))).sort((x, y) => y.w.length - x.w.length);
  for (const x of ws.slice(0, 4)) await swipe(a, x.p, 2);
  for (const x of ws.slice(2, 7)) await swipe(b, x.p, 2);
  if (shots) await a.screenshot({ path: shots + '/x-duel-desktop.png' });
  await a.waitForFunction(() => document.querySelector('#resTitle').textContent.match(/win|heat/), null, { timeout: 20000 });
  await sleep(300);
  if (shots) await a.screenshot({ path: shots + '/x-results-desktop.png' });
  console.log('EXTRAS OK');
} finally { await t.stop(); }
