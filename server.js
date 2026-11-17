// BuktiKu — minimal static file server (no dependencies).
// Serves everything in ./public on PORT (env) or 3000.
// One API route: POST /api/fetch-source {url} -> readable page text,
// which the client drops into the Source box (visible + editable).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSource } from './lib/fetch-source.js';

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function handleFetchSource(req, res) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 8192) { sendJson(res, 413, { ok: false, error: 'Request too large.' }); return; }
  }
  let url;
  try { url = JSON.parse(raw).url; } catch { /* handled below */ }
  if (!url) { sendJson(res, 400, { ok: false, error: 'Missing url.' }); return; }
  const result = await fetchSource(url);
  sendJson(res, result.ok ? 200 : 400, result);
}

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const port = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/fetch-source') {
      await handleFetchSource(req, res);
      return;
    }
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/') path = '/index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(port, () => {
  console.log(`BuktiKu listening on http://localhost:${port}`);
});
