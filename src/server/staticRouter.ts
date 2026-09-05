/**
 * Servidor de archivos estáticos (JS, CSS, assets, fonts, imágenes) para el Portal Siglo 21.
 * Sirve tanto el bundle compilado de React (Vite) como recursos estáticos tradicionales.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Busca carpeta public en raíz del paquete o dist
const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const FALLBACK_PUBLIC_DIR = path.resolve(process.cwd(), 'public');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
};

export function getPublicIndexPath(): string | null {
  const primaryIndex = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(primaryIndex)) return primaryIndex;

  const fallbackIndex = path.join(FALLBACK_PUBLIC_DIR, 'index.html');
  if (fs.existsSync(fallbackIndex)) return fallbackIndex;

  return null;
}

export function handleStaticRequest(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): boolean {
  // Maneja /assets/*, /static/*, /favicon.* y archivos con extensión conocida
  const isStaticPrefix = pathname.startsWith('/static/') || pathname.startsWith('/assets/');
  const ext = path.extname(pathname).toLowerCase();
  const isKnownAsset = ext in MIME_TYPES && pathname !== '/' && pathname !== '/index.html';

  if (!isStaticPrefix && !isKnownAsset) {
    return false;
  }

  let relativePath = pathname.replace(/^\/+/, '');
  if (pathname.startsWith('/static/')) {
    relativePath = pathname.replace(/^\/static\//, '');
  }

  // Prevenir Directory Traversal
  const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');

  let fullPath = path.resolve(PUBLIC_DIR, safePath);
  if (!fs.existsSync(fullPath)) {
    fullPath = path.resolve(FALLBACK_PUBLIC_DIR, safePath);
  }

  // Normalizar para comparación robusta y compatible con Windows
  const normFullPath = path.normalize(fullPath).toLowerCase();
  const normPublicDir = path.normalize(PUBLIC_DIR).toLowerCase();
  const normFallbackDir = path.normalize(FALLBACK_PUBLIC_DIR).toLowerCase();

  const ensureTrailingSep = (p: string) => (p.endsWith(path.sep) ? p : p + path.sep);

  const inPublicDir =
    normFullPath.startsWith(ensureTrailingSep(normPublicDir)) || normFullPath === normPublicDir;
  const inFallbackDir =
    normFullPath.startsWith(ensureTrailingSep(normFallbackDir)) || normFullPath === normFallbackDir;

  if (!inPublicDir && !inFallbackDir) {
    console.warn(`[StaticRouter] 403 Acceso denegado para: ${pathname} (normFullPath: ${normFullPath})`);
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Acceso denegado');
    return true;
  }


  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const fileExt = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[fileExt] || 'application/octet-stream';

    // Caché inmutable para assets con hash de Vite
    const cacheControl = pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl
    });
    fs.createReadStream(fullPath).pipe(res);
    return true;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Archivo estático no encontrado');
  return true;
}
