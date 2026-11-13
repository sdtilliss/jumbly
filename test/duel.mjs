// Live duel between two tabs: lobby, synced start (guest clock deliberately 7.3 s fast), words, tally, rematch, reload, leave.
// WW_NET picks the transport: local (BroadcastChannel, default), room (mocked claude.ai room), relay (needs WW_BROKER=ws://...).
import { start, fonts, check, sleep, live, state, words, swipe, devices } from './lib.mjs';
import { readFileSync } from 'node:fs';
const shots = process.env.WW_SHOTS || '', NET = process.env.WW_NET || 'local';
const pts = n => n - 2;
const t = await start();
try {
  const qs = NET === 'relay' ? `?secs=14&broker=${encodeURIComponent(process.env.WW_BROKER)}` : NET === 'room' ? '?secs=14' : '?secs=14&net=local';
  const mk = async (skewMs, phone) => {
    // relay: separate browser contexts (like two devices). local/room: one context, because BroadcastChannel carries the messages.
    const ctx = NET === 'relay' || !mk.ctx ? await t.browser.newContext(phone ? { ...devices['iPhone 13'] } : { viewport: { width: 1000, height: 760 } }) : mk.ctx;
    if (!mk.ctx) mk.ctx = ctx;
    await fonts(ctx, t.url);
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', e => page.errors.push(String(e)));
    await page.addInitScript(skew => {
      const real = Date.now.bind(Date);
      if (skew) Date.now = () => real() + skew;
      window.__lives = [];
      let was = false;
      setInterval(() => { const on = !!(window.__ww && window.__ww.G.live); if (on && !was) window.__lives.push(performance.timeOrigin + performance.now()); was = on; }, 4);
    }, skewMs);
    if (NET === 'room') await page.addInitScript(readFileSync(new URL('./mock-room.js', import.meta.url), 'utf8'));
    return page;
  };
  const host = await mk(0, true), guest = await mk(7300, true);
  await host.goto(t.url + qs);
  await host.waitForFunction(() => window.__ww && window.__ww.Core.size() > 100000);
  await host.tap('[data-size="5"]');
  if (NET === 'room') await host.tap('#homeSetup [data-i="0"]');   // no dev clock override inside claude.ai: play real 30 s rounds
  await host.tap('#playDuel');
  await host.waitForSelector('#lobby:not([hidden])');
  const code = await host.evaluate(() => window.__ww.Duel.code());
  check(/^[a-z0-9]{5}$/.test(code), 'host opened room ' + code);
  check((await host.evaluate(() => location.hash)) === '#duel-' + code, 'address carries the room');
  check(await host.isDisabled('#startDuel'), 'start is disabled while alone');
  await host.fill('#nameInput', 'Hostess');
  if (shots) await host.screenshot({ path: shots + '/lobby-host-waiting.png' });

  await guest.goto(t.url + qs);
  await guest.waitForFunction(() => window.__ww && window.__ww.Core.size() > 100000);
  if (NET !== 'relay') {
    await guest.waitForSelector('#openDuels:not([hidden]) button', { timeout: 8000 });
    check((await guest.textContent('#openList')).includes('5×5'), 'guest sees the open duel on the home screen');
    if (shots) await guest.screenshot({ path: shots + '/home-open-duel.png' });
    await guest.tap('#openList button');
  } else {
    await guest.tap('#haveCode'); await guest.fill('#sheetInput', code.toUpperCase()); await guest.tap('#sheetBox .btn.primary');
  }
  await guest.waitForSelector('#lobby:not([hidden])');
  await guest.fill('#nameInput', 'Guesto');
  await host.waitForFunction(() => !document.querySelector('#startDuel').disabled, null, { timeout: 10000 });
  await host.waitForFunction(() => document.querySelector('#oppName').textContent === 'Guesto', null, { timeout: 5000 });
  await guest.waitForFunction(() => document.querySelector('#oppName').textContent === 'Hostess', null, { timeout: 5000 });
  check(true, 'both players see each other by name');
  check((await guest.textContent('#lobbySetup [data-v="size"]')) === '5 × 5' && await guest.isHidden('#startDuel'), 'guest sees host settings, cannot start');
  await sleep(1800);   // let the clock pings finish
  if (shots) { await host.screenshot({ path: shots + '/lobby-host-ready.png' }); await guest.screenshot({ path: shots + '/lobby-guest.png' }); }

  await host.tap('#startDuel');
  await Promise.all([live(host), live(guest)]);
  const [la, lb] = [await host.evaluate(() => window.__lives[0]), await guest.evaluate(() => window.__lives[0])];
  check(Math.abs(la - lb) < 200, `both boards went live ${Math.abs(la - lb).toFixed(0)} ms apart despite a 7.3 s clock difference`);
  const [sa, sb] = [await state(host), await state(guest)];
  check(sa.board === sb.board && sa.size === 5, 'same 5x5 board on both sides');
  await sleep(600);

  const all = (await words(host)).sort((a, b) => b.w.length - a.w.length || (a.w < b.w ? -1 : 1));
  const five = all.filter(x => x.w.length === 5), four = all.filter(x => x.w.length === 4), three = all.filter(x => x.w.length === 3);
  const shared = [five[0], three[0]], onlyHost = [five[1], four[0]], onlyGuest = [four[1]];
  for (const x of [...shared, ...onlyHost]) await swipe(host, x.p, 3);
  for (const x of [...shared, ...onlyGuest]) await swipe(guest, x.p, 3);
  check((await state(host)).found.length === 4 && (await state(guest)).found.length === 3, 'host found 4, guest found 3');
  await host.waitForFunction(() => document.querySelector('#rvThem').textContent === '3 words', null, { timeout: 5000 });
  await guest.waitForFunction(() => document.querySelector('#rvThem').textContent === '4 words', null, { timeout: 5000 });
  check(true, 'each sees the other\'s live word count');
  if (shots) await host.screenshot({ path: shots + '/duel-game.png' });

  await Promise.all([host.waitForFunction(() => document.querySelector('#resTitle').textContent.match(/win|heat/), null, { timeout: 50000 }),
    guest.waitForFunction(() => document.querySelector('#resTitle').textContent.match(/win|heat/), null, { timeout: 50000 })]);
  const sum = xs => xs.reduce((a, x) => a + pts(x.w.length), 0);
  const expHost = sum(shared) + 2 * sum(onlyHost), expGuest = sum(shared) + 2 * sum(onlyGuest);
  const read = async p => ({ you: +(await p.textContent('#tYou')), them: +(await p.textContent('#tThem')), title: await p.textContent('#resTitle'),
    cy: await p.$$eval('#cYou li span', e => e.map(x => x.textContent)), cb: await p.$$eval('#cBoth li span', e => e.map(x => x.textContent)), ct: await p.$$eval('#cThem li span', e => e.map(x => x.textContent)) });
  const rh = await read(host), rg = await read(guest);
  check(rh.you === expHost && rh.them === expGuest, `host tally ${rh.you}-${rh.them} (shared at face value, unique doubled)`);
  check(rg.you === expGuest && rg.them === expHost, `guest tally ${rg.you}-${rg.them} mirrors it`);
  check(rh.title === 'You win' && rg.title === 'Hostess wins', 'winner named on both sides');
  check(rh.cb.sort().join() === shared.map(x => x.w).sort().join() && rh.cy.sort().join() === onlyHost.map(x => x.w).sort().join() && rh.ct.join() === onlyGuest[0].w, 'words sorted into only-you / both / only-them');
  if (shots) { await host.screenshot({ path: shots + '/duel-results-host.png' }); await guest.screenshot({ path: shots + '/duel-results-guest.png' }); }

  // rematch
  await host.tap('#rematch');
  await Promise.all([live(host), live(guest)]);
  const [s2a, s2b] = [await state(host), await state(guest)];
  check(s2a.board === s2b.board && s2a.board !== sa.board && s2a.found.length === 0, 'rematch deals a fresh shared board');
  const [l2a, l2b] = [await host.evaluate(() => window.__lives[1]), await guest.evaluate(() => window.__lives[1])];
  check(Math.abs(l2a - l2b) < 200, `rematch start ${Math.abs(l2a - l2b).toFixed(0)} ms apart`);
  await sleep(500);

  // guest finds a word, reloads mid-round, and is put back in with it
  const again = (await words(guest)).sort((a, b) => b.w.length - a.w.length)[3];
  await swipe(guest, again.p, 3);
  await sleep(900);
  await guest.reload();
  await live(guest);
  const s3 = await state(guest);
  check(s3.board === s2a.board && s3.found.includes(again.w), 'guest reloaded mid-round and kept the board and word');
  await Promise.all([host.waitForFunction(() => document.querySelector('#resTitle').textContent.match(/win|heat/), null, { timeout: 50000 }),
    guest.waitForFunction(() => document.querySelector('#resTitle').textContent.match(/win|heat/), null, { timeout: 50000 })]);
  check((await guest.textContent('#resTitle')) === 'You win' && +(await host.textContent('#tThem')) === 2 * pts(again.w.length), 'second tally correct after the reload');

  // guest leaves; host is told and the room reopens
  await guest.tap('#resActions .btn:not(.primary)');
  check(await guest.isVisible('#home') && (await guest.evaluate(() => location.hash)) === '', 'guest back home');
  await host.waitForFunction(() => /left the room/.test(document.querySelector('#resStatus').textContent) && document.querySelector('#rematch').disabled, null, { timeout: NET === 'relay' ? 20000 : 12000 });
  check(true, 'host sees that the guest left');
  // joining by link works too
  const g2 = await mk(-2500, true);
  await g2.goto(t.url + qs + '#duel-' + code);
  await g2.waitForSelector('#lobby:not([hidden])');
  await host.waitForFunction(() => !document.querySelector('#rematch').disabled, null, { timeout: 10000 });
  check(true, 'a new guest joined straight from the invite link');
  await sleep(1500);
  await host.tap('#rematch');
  await Promise.all([live(host), live(g2)]);
  const [l3a, l3b] = [await host.evaluate(() => window.__lives[2]), await g2.evaluate(() => window.__lives[0])];
  check(Math.abs(l3a - l3b) < 200, `link guest (clock 2.5 s slow) started ${Math.abs(l3a - l3b).toFixed(0)} ms apart`);
  // third player is turned away
  const g3 = await mk(0, true);
  await g3.goto(t.url + qs + '#duel-' + code);
  await g3.waitForFunction(() => /already has two players/.test(document.querySelector('#lobbyStatus').textContent), null, { timeout: 10000 });
  check(true, 'a third player is told the room is full');
  for (const p of [host, guest, g2, g3]) check(p.errors.length === 0, 'no page errors ' + p.errors.join(' | '));
  console.log('DUEL OK (' + NET + ')');
} finally { await t.stop(); }
