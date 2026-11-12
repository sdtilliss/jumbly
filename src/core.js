/* Wordweft core: dictionary, board generation, solver, scoring. No DOM. */
const Core = (() => {
  let W = [];            // sorted word list
  let WSET = new Set();

  /* The packed list is front-coded: a capital letter (shared-prefix length, A=0) then the new suffix. */
  function loadDict(packed) {
    const out = [];
    let prev = '', i = 0;
    const n = packed.length;
    while (i < n) {
      const k = packed.charCodeAt(i) - 65;
      let j = i + 1;
      while (j < n && packed.charCodeAt(j) >= 97) j++;
      prev = prev.slice(0, k) + packed.slice(i + 1, j);
      out.push(prev);
      i = j;
    }
    W = out;
    WSET = new Set(out);
    return out.length;
  }

  const isWord = w => WSET.has(w);

  /* 3 letters = 1, then each extra letter is worth one more than the last step: 1, 2, 4, 7, 11, 16, 22 ... */
  const points = len => (len < 3 ? 0 : 1 + ((len - 3) * (len - 2)) / 2);

  const nbCache = {};
  function neighbors(size) {
    if (nbCache[size]) return nbCache[size];
    const out = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      const a = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < size && cc < size) a.push(rr * size + cc);
      }
      out.push(a);
    }
    return (nbCache[size] = out);
  }
  const adjacent = (size, a, b) => {
    const dr = Math.abs(((a / size) | 0) - ((b / size) | 0)), dc = Math.abs((a % size) - (b % size));
    return (dr | dc) !== 0 && dr <= 1 && dc <= 1;
  };

  /* A tile holding "q" plays as "qu". */
  const tileText = ch => (ch === 'q' ? 'qu' : ch);
  const wordOf = (board, path) => { let s = ''; for (let k = 0; k < path.length; k++) s += tileText(board[path[k]]); return s; };

  /* Every word on the board. Walks the grid while narrowing a [lo, hi) window of the sorted
     list to the words that share the current prefix, so dead ends are cut immediately. */
  function solve(board, size, minLen) {
    const N = size * size, nb = neighbors(size), found = new Map();
    const used = new Uint8Array(N), path = [];
    let nlo = 0, nhi = 0;
    function narrow(lo, hi, d, c) {
      let a = lo, b = hi;
      while (a < b) { const m = (a + b) >> 1; if (W[m].charCodeAt(d) >= c) b = m; else a = m + 1; }
      nlo = a; b = hi;
      while (a < b) { const m = (a + b) >> 1; if (W[m].charCodeAt(d) > c) b = m; else a = m + 1; }
      nhi = a;
    }
    function dfs(i, lo, hi, d, word) {
      const ch = board[i];
      narrow(lo, hi, d, ch.charCodeAt(0)); d++;
      if (nlo >= nhi) return;
      if (ch === 'q') { narrow(nlo, nhi, d, 117); d++; if (nlo >= nhi) return; word += 'qu'; } else word += ch;
      const l = nlo, h = nhi;
      used[i] = 1; path.push(i);
      if (d >= minLen && W[l].length === d && !found.has(word)) found.set(word, path.slice());
      const ns = nb[i];
      for (let k = 0; k < ns.length; k++) if (!used[ns[k]]) dfs(ns[k], l, h, d, word);
      used[i] = 0; path.pop();
    }
    for (let i = 0; i < N; i++) dfs(i, 0, W.length, 0, '');
    return found;
  }

  /* A path that spells `word` on the board (for keyboard play), or null. */
  function findPath(board, size, word) {
    const N = size * size, nb = neighbors(size), used = new Uint8Array(N), path = [];
    function go(i, pos) {
      const ch = board[i];
      let L = 0;
      if (ch === 'q') { if (word.startsWith('qu', pos)) L = 2; } else if (word[pos] === ch) L = 1;
      if (!L) return false;
      used[i] = 1; path.push(i);
      if (pos + L === word.length) return true;
      const ns = nb[i];
      for (let k = 0; k < ns.length; k++) if (!used[ns[k]] && go(ns[k], pos + L)) return true;
      used[i] = 0; path.pop();
      return false;
    }
    for (let i = 0; i < N; i++) if (go(i, 0)) return path.slice();
    return null;
  }

  /* Letter weights tuned for swipe play: roughly how often each letter turns up in dictionary
     words, with S pulled down a little so boards are not all plurals. */
  const VOWELS = { e: 11.4, a: 8.6, i: 7.4, o: 7.0, u: 3.4 };
  const CONSONANTS = {
    t: 7.0, r: 6.9, n: 6.6, s: 5.4, l: 5.3, d: 4.1, c: 3.6, m: 3.1, p: 3.1, h: 2.9, g: 2.7,
    b: 2.1, y: 2.0, f: 1.9, w: 1.5, k: 1.4, v: 1.2, x: 0.45, z: 0.45, j: 0.4, q: 0.4
  };
  const RARE = 'jqxz';
  function draw(table, counts, cap, rareLeft, rnd) {
    let total = 0;
    const keys = Object.keys(table), ok = [];
    for (const k of keys) {
      const isRare = RARE.includes(k);
      if ((counts[k] || 0) >= (isRare ? 1 : cap)) continue;
      if (isRare && rareLeft <= 0) continue;
      ok.push(k); total += table[k];
    }
    let x = rnd() * total;
    for (const k of ok) { x -= table[k]; if (x <= 0) return k; }
    return ok[ok.length - 1];
  }
  function rollBoard(size, rnd) {
    rnd = rnd || Math.random;
    const N = size * size;
    const nv = Math.round(N * (0.31 + rnd() * 0.09));       // 31-40% vowels
    const cap = size === 4 ? 2 : size === 5 ? 3 : 4;         // copies of any one letter
    let rareLeft = size === 4 ? 1 : 2;
    const counts = {}, out = [];
    for (let i = 0; i < N; i++) {
      const k = draw(i < nv ? VOWELS : CONSONANTS, counts, i < nv ? cap + 1 : cap, rareLeft, rnd);
      counts[k] = (counts[k] || 0) + 1;
      if (RARE.includes(k)) rareLeft--;
      out.push(k);
    }
    for (let i = N - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = out[i]; out[i] = out[j]; out[j] = t; }
    return out;
  }

  /* What a board must offer before we deal it: enough words, and enough long ones to chase. */
  const TARGET = { 4: { words: 70, long: 6 }, 5: { words: 170, long: 22 }, 6: { words: 320, long: 55 } };
  function rate(sol) { let long = 0; for (const w of sol.keys()) if (w.length >= 6) long++; return { words: sol.size, long }; }
  function makeBoard(size, minLen, budgetMs) {
    const t0 = Date.now(), want = TARGET[size];
    let best = null;
    for (let k = 0; k < 24; k++) {
      const board = rollBoard(size), sol = solve(board, size, minLen), q = rate(sol);
      const fit = Math.min(1, q.words / want.words) + Math.min(1, q.long / want.long);
      if (!best || fit > best.fit) best = { board, sol, fit };
      if (fit >= 2 || Date.now() - t0 > (budgetMs || 260)) break;
    }
    return best;
  }

  return { loadDict, isWord, points, neighbors, adjacent, tileText, wordOf, solve, findPath, rollBoard, makeBoard, rate, TARGET, size: () => W.length };
})();
