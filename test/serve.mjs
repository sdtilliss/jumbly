// Tiny static server for site/ (tests and local play): node test/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2' };
export function serve(port = 0, extraRoots = {}) {
  const root = fileURLToPath(new URL('../site/', import.meta.url));
  const srv = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let base = root;
      for (const [prefix, dir] of Object.entries(extraRoots)) if (p.startsWith(prefix)) { base = dir; p = p.slice(prefix.length - 1); }
      if (p.endsWith('/')) p += 'index.html';
      const file = join(base, normalize(p));
      if (!file.startsWith(base)) throw new Error('outside root');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch (e) { res.writeHead(404); res.end('not found'); }
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r({ srv, port: srv.address().port, url: 'http://127.0.0.1:' + srv.address().port + '/' })));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) serve(+process.argv[2] || 8080).then(s => console.log('Jumbly at ' + s.url));
