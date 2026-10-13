import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

const security = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/** Pages for signed-in people stay out of search engines. */
const privatePage = /^\/(dashboard|signin|account|owner)(\/|$)/;

async function isFile(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Serves the built website from `root`: files as they are, and index.html
 * for every page address so the app's own router can show it.
 */
export function createHandler(root: string) {
  const base = resolve(root);
  const index = join(base, 'index.html');

  function send(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    headers: Record<string, string>,
  ) {
    res.writeHead(200, {
      ...security,
      'Content-Type': types[extname(path)] ?? 'application/octet-stream',
      ...headers,
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(path).pipe(res);
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...security, Allow: 'GET, HEAD' });
      return res.end();
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(
        new URL(req.url ?? '/', 'http://x').pathname,
      );
    } catch {
      res.writeHead(400, security);
      return res.end();
    }
    if (pathname === '/healthz') {
      res.writeHead(200, {
        ...security,
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
      });
      return res.end('ok');
    }

    const file = resolve(base, `.${normalize(pathname)}`);
    if (file !== base && !file.startsWith(base + sep)) {
      res.writeHead(404, security);
      return res.end();
    }
    if (file !== index && (await isFile(file)))
      return send(req, res, file, {
        'Cache-Control': pathname.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600',
      });
    // A missing file (it has an extension) is a real 404, not a page.
    if (extname(pathname)) {
      res.writeHead(404, { ...security, 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    return send(req, res, index, {
      'Cache-Control': 'no-cache',
      ...(privatePage.test(pathname)
        ? { 'X-Robots-Tag': 'noindex, nofollow' }
        : {}),
    });
  };
}
