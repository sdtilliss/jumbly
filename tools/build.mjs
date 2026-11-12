// Builds both outputs from src/:
//   dist/artifact.html  - the page fragment published as a claude.ai artifact (words.js is published beside it)
//   site/               - a self-contained folder (index.html + words.js) for any static host
// Usage: node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');

const core = read('src/core.js').trimEnd();
let page = read('src/page.html');
if (!page.includes('/*@CORE@*/')) throw new Error('core marker missing');
page = page.replace('/*@CORE@*/', () => core);

mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/artifact.html', root), page);

// Self-hosted copy: lift <title>/<meta>/<link> into a real <head>.
const cut = page.indexOf('<style>');
const headBits = page.slice(0, cut).split('\n').filter(l => l.trim() && !l.includes('claude:viewport')).join('\n');
const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Wordweft: swipe words out of a grid of letters. Solo or live head-to-head.">
${headBits}
<style>:root{padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}</style>
</head>
<body>
${page.slice(cut)}</body>
</html>
`;
mkdirSync(new URL('site/', root), { recursive: true });
writeFileSync(new URL('site/index.html', root), doc);
copyFileSync(new URL('src/words.js', root), new URL('site/words.js', root));
console.log('built dist/artifact.html (' + (page.length / 1024).toFixed(0) + ' KiB) and site/');
