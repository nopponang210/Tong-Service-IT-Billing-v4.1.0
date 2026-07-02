import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const folderArg = process.argv[2] || 'src';
const port = Number(process.argv[3] || process.env.PORT || 5500);
const base = path.resolve(root, folderArg);
const mime = {
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const target = path.resolve(base, `.${urlPath}`);
  if (!target.startsWith(base)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(target, (statError, stat) => {
    let file = target;
    if (!statError && stat.isDirectory()) file = path.join(target, 'index.html');
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
      res.end(data);
    });
  });
});
server.listen(port, '0.0.0.0', () => console.log(`Frontend running at http://localhost:${port}`));
