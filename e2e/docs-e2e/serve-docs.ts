/**
 * Lightweight server that wraps the Cloudflare Pages entry point for local/CI testing. Serves
 * static files from packages/docs/dist/ and delegates dynamic requests to the SSR fetch handler.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const docsRoot = join(__dirname, '../../packages/docs');
const distDir = join(docsRoot, 'dist');
const serverEntry = join(docsRoot, 'server', 'entry.cloudflare-pages.js');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.txt': 'text/plain',
  '.xml': 'text/xml',
  '.webmanifest': 'application/manifest+json',
};

/** Serve a static file from dist/, returns null if not found */
function serveStatic(pathname: string): Response | null {
  // Try exact path, then with index.html
  const candidates = [join(distDir, pathname)];
  if (!extname(pathname)) {
    candidates.push(join(distDir, pathname, 'index.html'));
  }

  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath);
        const ext = extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        return new Response(content, {
          headers: { 'Content-Type': contentType },
        });
      } catch {
        // fall through
      }
    }
  }
  return null;
}

async function main() {
  const port = parseInt(process.env.PORT || '3000', 10);

  // Import the cloudflare pages entry
  const { fetch: cfFetch } = await import(serverEntry).catch((e) => {
    console.error(
      `Failed to load server entry at ${serverEntry}. Did you run pnpm build.packages.docs?`,
      e
    );
    process.exit(1);
  });

  // Create env.ASSETS that serves static files
  const env = {
    ASSETS: {
      fetch: (request: Request) => {
        const url = new URL(request.url);
        const staticResponse = serveStatic(url.pathname);
        if (staticResponse) {
          return staticResponse;
        }
        return new Response('Not Found', { status: 404 });
      },
    },
  };

  // Minimal waitUntil implementation
  const ctx = {
    waitUntil: (_promise: Promise<unknown>) => {
      /* no-op for testing */
    },
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://localhost:${port}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
      }

      const request = new Request(url.toString(), {
        method: req.method,
        headers,
      });

      const response: Response = await cfFetch(request, env, ctx);

      const responseHeaders = Object.fromEntries(response.headers.entries());
      // Required for SharedArrayBuffer (REPL uses worker threads in-browser)
      responseHeaders['cross-origin-opener-policy'] = 'same-origin';
      responseHeaders['cross-origin-embedder-policy'] = 'credentialless';
      res.writeHead(response.status, responseHeaders);
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          res.write(value);
        }
      }
      res.end();
    } catch (e) {
      console.error('Server error:', e);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  });

  server.listen(port, () => {
    console.warn(`Docs server listening on http://localhost:${port}`);
  });
}

main();
