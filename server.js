// Servidor estático de desenvolvimento. Não faz parte do que vai para a hospedagem.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const FIXTURES_DIR = join(ROOT, 'fixtures');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
  '.cbz': 'application/vnd.comicbook+zip',
};

export function mimeFor(path) {
  return TYPES[extname(path).toLowerCase()] || 'application/octet-stream';
}

function resolveFile(urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (rel.split(/[\\/]/).includes('..')) return null;
  let base = PUBLIC_DIR;
  if (rel.startsWith('/fixtures/')) {
    base = FIXTURES_DIR;
    rel = rel.slice('/fixtures'.length);
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = resolve(base, '.' + normalize(rel));
  if (file !== base && !file.startsWith(base + sep)) return null;
  return file;
}

export function createAppServer() {
  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    const { pathname } = new URL(req.url, 'http://localhost');
    const file = resolveFile(pathname);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Não encontrado');
      return;
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': mimeFor(file), 'cache-control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Não encontrado');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 5174;
  createAppServer().listen(port, () => console.log(`Leitor em http://localhost:${port}`));
}
