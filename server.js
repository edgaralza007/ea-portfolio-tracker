import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { getCompany, normalizeSymbol } from './lib/data.js';

const port = Number(process.env.PORT || 4318);
const files = { '/': ['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/styles.css':['styles.css','text/css'], '/favicon.svg':['favicon.svg','image/svg+xml'] };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method !== 'GET') { res.writeHead(405); return res.end('Method not allowed'); }
    if (url.pathname === '/api/company') {
      res.setHeader('Content-Type','application/json');
      res.setHeader('Cache-Control','no-store');
      let symbol;
      try { symbol = normalizeSymbol(url.searchParams.get('symbol')); } catch (e) { res.writeHead(400); return res.end(JSON.stringify({error:e.message})); }
      const data = await getCompany(symbol, url.searchParams.get('refresh') === '1');
      return res.end(JSON.stringify(data));
    }
    const file = files[url.pathname];
    if (!file) { res.writeHead(404); return res.end('Not found'); }
    res.setHeader('Content-Type',`${file[1]}; charset=utf-8`);
    res.setHeader('Cache-Control','no-cache');
    res.end(await readFile(new URL(`./public/${file[0]}`, import.meta.url)));
  } catch (e) {
    res.writeHead(e.status || 500, {'Content-Type':'application/json'});
    res.end(JSON.stringify({error: e.status ? e.message : 'Something went wrong. Please try again.'}));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`\n  EA Signal is running at http://127.0.0.1:${port}\n  Press Ctrl+C to stop.\n`));
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Use PORT=4319 npm start, or open the existing server.` : error.message); process.exitCode = 1; });
