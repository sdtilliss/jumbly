// Solo round, desktop: mouse swipes, taps, typing, duplicate + invalid handling, clock, results.
import { start, fonts, check, sleep, live, state, words, swipe, center, nonWord } from './lib.mjs';
const shots = process.env.WW_SHOTS || '';
const t = await start();
try {
  const ctx = await t.browser.newContext({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 1 });
  await fonts(ctx, t.url);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.goto(t.url + '?secs=14&net=local');
  await page.waitForFunction(() => window.__ww && window.__ww.Core.size() > 100000);
  check(await page.title() === 'Jumbly', 'title');
  if (shots) await page.screenshot({ path: shots + '/home-desktop.png' });

  await page.click('[data-size="5"]');
  await page.click('#playSolo');
  check(await page.isVisible('#count'), 'countdown overlay shows');
  check(await page.evaluate(() => document.querySelector('#board').classList.contains('veil')), 'letters hidden until go');
  await live(page);
  let s = await state(page);
  check(s.size === 5 && s.board.length === 25 && s.total > 100, `5x5 board dealt with ${s.total} words`);

  const all = (await words(page)).sort((a, b) => b.w.length - a.w.length);
  const w1 = all.find(x => x.w.length === 5) || all[0];
  await swipe(page, w1.p);
  s = await state(page);
  check(s.found.includes(w1.w), `swiped "${w1.w}" and it counted`);
  check(s.score === w1.w.length - 2, `score is ${s.score} for ${w1.w.length} letters`);
  check((await page.textContent('#chips')).toLowerCase().includes(w1.w), 'chip added');
  if (shots) await page.screenshot({ path: shots + '/game-desktop.png' });

  await swipe(page, w1.p);
  s = await state(page);
  check(s.found.length === 1, 'duplicate not counted twice');
  check(await page.evaluate(() => document.querySelector('#wordbar').dataset.st) === 'dup', 'duplicate flagged');

  const bad = await nonWord(page);
  await swipe(page, bad);
  s = await state(page);
  check(s.found.length === 1 && await page.evaluate(() => document.querySelector('#wordbar').dataset.st) === 'bad', 'non-word rejected');

  // live validation while the swipe is still held
  const w2 = all.find(x => x.w.length === 4 && x.w !== w1.w);
  const pts = []; for (const i of w2.p) pts.push(await center(page, i));
  await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down();
  for (let k = 1; k < pts.length; k++) await page.mouse.move(pts[k].x, pts[k].y, { steps: 3 });
  check(await page.evaluate(() => document.querySelector('#board').dataset.st) === 'good' && (await page.textContent('#word')).toLowerCase() === w2.w, `"${w2.w}" shows as valid before release`);
  check((await page.textContent('#wtag')) === '+2', 'points preview shown');
  // backtrack one tile
  await page.mouse.move(pts[pts.length - 2].x, pts[pts.length - 2].y, { steps: 3 });
  check((await page.textContent('#word')).length === w2.w.length - (w2.w.endsWith('qu') ? 2 : 1), 'sliding back removes the last letter');
  await page.mouse.move(pts[pts.length - 1].x, pts[pts.length - 1].y, { steps: 3 });
  await page.mouse.up();
  s = await state(page);
  check(s.found.includes(w2.w), 'second word counted');

  // tap mode: tap each tile, tap the last again
  const w3 = all.find(x => x.w.length === 3 && !s.found.includes(x.w));
  for (const i of w3.p) { const c = await center(page, i); await page.mouse.click(c.x, c.y); }
  check((await state(page)).found.length === 2, 'taps alone do not submit');
  const lastC = await center(page, w3.p[w3.p.length - 1]); await page.mouse.click(lastC.x, lastC.y);
  s = await state(page);
  check(s.found.includes(w3.w), `tapped "${w3.w}" letter by letter`);

  // keyboard
  const w4 = all.find(x => x.w.length === 6 && !s.found.includes(x.w) && !x.w.includes('q')) || all.find(x => !s.found.includes(x.w) && !x.w.includes('q'));
  await page.keyboard.type(w4.w, { delay: 15 });
  check((await page.textContent('#word')).toLowerCase() === w4.w, 'typed word is traced on the grid');
  await page.keyboard.press('Enter');
  s = await state(page);
  check(s.found.includes(w4.w), `typed "${w4.w}"`);
  await page.keyboard.type('zzzz'); await page.keyboard.press('Escape');
  check((await page.textContent('#word')) === '', 'escape clears');

  // clock runs out
  await page.waitForSelector('#results:not([hidden])', { timeout: 20000 });
  check(!(await state(page)).live, 'round ended on time');
  check((await page.textContent('#stWords')).startsWith('4 of '), 'results show 4 words');
  check(+(await page.textContent('#stScore')) === s.score, 'results show the score');
  await page.click('#missed summary');
  if (shots) await page.screenshot({ path: shots + '/results-solo-desktop.png', fullPage: false });
  await page.click('#resActions .btn.primary');
  await live(page);
  check((await state(page)).found.length === 0, 'play again deals a fresh round');
  // quit flow
  await page.click('#quit'); await page.click('#sheetBox .btn.primary');
  await page.waitForSelector('#results:not([hidden])', { timeout: 5000 });
  await page.click('#resActions .btn:not(.primary)');
  check(await page.isVisible('#home'), 'home again');
  check(errors.length === 0, 'no page errors ' + errors.join(' | '));
  console.log('SOLO OK');
} finally { await t.stop(); }
