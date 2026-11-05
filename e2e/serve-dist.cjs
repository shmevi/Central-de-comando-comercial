// Serve dist/ como a Vercel/Netlify farão: mesmos cabeçalhos (security-headers.json) e fallback de SPA.
// Uso: npm run build && node e2e/serve-dist.cjs [porta]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', process.env.DIST_DIR || 'dist');
const PORT = Number(process.argv[2] || 4173);
const headers = Object.entries(JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'security-headers.json'), 'utf8'))).filter(([k]) => k !== '//');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(400); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html'); // fallback SPA
  for (const [k, v] of headers) res.setHeader(k, v);
  if (url.pathname.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`dist/ em http://localhost:${PORT} (com cabeçalhos de produção)`));
