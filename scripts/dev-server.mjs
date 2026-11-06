import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

export function createDevServer(root = defaultRoot) {
  const rootPromise = realpath(root);
  return createServer(async (request, response) => {
    const fail = (status, text) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : text);
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      return fail(405, 'Método no permitido');
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      return fail(400, 'Ruta no válida');
    }
    const segments = pathname.split('/').filter(Boolean);
    if (segments.some(segment => segment.startsWith('.') || segment.includes('\\') || segment.includes('\0'))) {
      return fail(403, 'Ruta no permitida');
    }
    try {
      const base = await rootPromise;
      const target = await realpath(resolve(base, ...segments, ...(pathname.endsWith('/') ? ['index.html'] : [])));
      if (!target.startsWith(base + sep)) return fail(403, 'Ruta no permitida');
      if (!(await stat(target)).isFile()) return fail(404, 'Archivo no encontrado');
      const bytes = await readFile(target);
      response.writeHead(200, {
        'Content-Type': types[extname(target)] || 'application/octet-stream',
        'Content-Length': bytes.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes(error.code)) return fail(404, 'Archivo no encontrado');
      console.error('No se pudo servir el archivo:', error.code || error.message);
      fail(500, 'No se pudo servir el archivo');
    }
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const index = process.argv.indexOf('--port');
  const port = index < 0 ? 5173 : Number(process.argv[index + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('El puerto debe estar entre 1 y 65535.');
  const server = createDevServer();
  server.on('error', error => {
    console.error(`No se pudo iniciar el servidor: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`Cockpit Lab: http://127.0.0.1:${port}`));
}
