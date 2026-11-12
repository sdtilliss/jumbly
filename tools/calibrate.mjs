// Dev check: board-generator statistics. node tools/calibrate.mjs
import { readFileSync } from 'node:fs';
const win = {}; new Function('window', readFileSync(new URL('../src/words.js', import.meta.url), 'utf8'))(win);
const Core = new Function(readFileSync(new URL('../src/core.js', import.meta.url), 'utf8') + '\nreturn Core;')();
let t = Date.now(); console.log('dict', Core.loadDict(win.WORDWEFT_DICT), 'words in', Date.now() - t, 'ms');
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)];
for (const size of [4, 5, 6]) {
  const n = [], lg = [], ms = []; let best = '';
  for (let i = 0; i < 300; i++) { const b = Core.rollBoard(size); const t0 = performance.now(); const s = Core.solve(b, size, 3); ms.push(performance.now() - t0); const q = Core.rate(s); n.push(q.words); lg.push(q.long); }
  console.log(`raw ${size}x${size}: words p10=${pct(n,.1)} p35=${pct(n,.35)} p50=${pct(n,.5)} p90=${pct(n,.9)} | long(6+) p10=${pct(lg,.1)} p35=${pct(lg,.35)} p50=${pct(lg,.5)} p90=${pct(lg,.9)} | solve ms p50=${pct(ms,.5).toFixed(1)} p95=${pct(ms,.95).toFixed(1)}`);
  const m = [], ml = [], mt = [];
  for (let i = 0; i < 120; i++) { const t0 = performance.now(); const r = Core.makeBoard(size, 3); mt.push(performance.now() - t0); const q = Core.rate(r.sol); m.push(q.words); ml.push(q.long); if (i === 0) best = r.board.join('') + ' longest=' + [...r.sol.keys()].sort((a, b) => b.length - a.length).slice(0, 4).join(','); }
  console.log(`  dealt: words min=${Math.min(...m)} p50=${pct(m,.5)} | long min=${Math.min(...ml)} p50=${pct(ml,.5)} | make ms p50=${pct(mt,.5).toFixed(0)} p95=${pct(mt,.95).toFixed(0)} | e.g. ${best}`);
}
// sanity
const b = 'catsreopqnidlmae'.split('');
const sol = Core.solve(b, 4, 3);
console.log('sample board words', sol.size, 'has cat?', sol.has('cat'), 'path', sol.get('cat'), 'findPath(cats)', Core.findPath(b, 4, 'cats'), 'qu words', [...sol.keys()].filter(w => w.includes('q')).slice(0, 5));
console.log('points', [3,4,5,6,7,8,9].map(Core.points).join(','));
for (const [w, p] of sol) { if (Core.wordOf(b, p) !== w) throw new Error('path mismatch ' + w); for (let k = 1; k < p.length; k++) if (!Core.adjacent(4, p[k-1], p[k])) throw new Error('non-adjacent ' + w); if (new Set(p).size !== p.length) throw new Error('reuse ' + w); if (!Core.isWord(w)) throw new Error('not word'); }
console.log('all solver paths valid');
