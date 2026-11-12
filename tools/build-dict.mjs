// Builds src/words.js from the ENABLE word list (public domain).
// Usage: node tools/build-dict.mjs <path-to-enable1.txt>
import { readFileSync, writeFileSync } from 'node:fs';

const MIN = 3, MAX = 16;
const rot13 = s => s.replace(/[a-z]/g, c => String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97));
// Slurs we never accept or display. Stored rot13 so the repo stays clean.
const BLOCK = new Set(('avttre avttref snttbg snttbgf snttbgl snttbgel xvxr xvxrf fcvp fcvpf fcvx fcvxf jbc jbcf tbbx tbbxf ' +
  'qntb qntbf qntbrf qnexl qnexrl qnexvr qnexvrf qnexrlf jrgonpx jrgonpxf lvq lvqf genaal genaavrf ' +
  'cvpxnavaal cvpxnavaavrf cvppnavaal cvppnavaavrf cvpnavaal cvpnavaavrf wvtnobb wvtnobbf xnssve xnssvef xnsve xnsvef')
  .split(/\s+/).map(rot13));

const raw = readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
let dropped = 0;
const words = [...new Set(raw.map(w => w.trim().toLowerCase()))]
  .filter(w => new RegExp(`^[a-z]{${MIN},${MAX}}$`).test(w))
  .filter(w => !/q(?!u)/.test(w))            // unreachable: Q is always a "Qu" tile
  .filter(w => (BLOCK.has(w) ? (dropped++, false) : true))
  .sort();

// Front-coding: each entry is one capital letter (shared-prefix length, A=0) + the new suffix.
let out = '', prev = '';
for (const w of words) {
  let k = 0;
  while (k < prev.length && k < w.length && k < 25 && prev[k] === w[k]) k++;
  out += String.fromCharCode(65 + k) + w.slice(k);
  prev = w;
}
writeFileSync(new URL('../src/words.js', import.meta.url),
  '/* Wordweft word list: ENABLE (public domain), 3-16 letters, front-coded. */\nwindow.WORDWEFT_DICT="' + out + '";\n');
console.log(`${words.length} words, ${dropped} blocked, packed ${(out.length / 1024).toFixed(0)} KiB`);
