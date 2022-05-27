import type { Plugin } from 'vite';
import { resolve, join } from 'path';
import { readFileSync } from 'fs';
import esbuild from 'esbuild';
import { createHash } from 'crypto';

export function replServiceWorker(): Plugin {
  const srcReplServerHtml = resolve('public', 'repl', 'repl-server.html');
  const swPath = resolve('src', 'components', 'repl', 'worker', 'repl-service-worker.ts');

  return {
    name: 'replServiceWorker',

    resolveId(id) {
      if (id === '@repl-server-html') {
        return '\0@repl-server-html';
      }
      if (id === '@repl-server-url') {
        return '\0@repl-server-url';
      }
      return null;
    },

    load(id) {
      if (id === '\0@repl-server-html') {
        const html = readFileSync(srcReplServerHtml, 'utf-8');
        return `const replServerHtml = ${JSON.stringify(html)}; export default replServerHtml;`;
      }

      if (id === '\0@repl-server-url') {
        const hash = createHash('sha256');
        hash.update(readFileSync(srcReplServerHtml));
        const url = `/repl/~repl-server-${hash.digest('hex').slice(0, 10)}.html`;
        return `const replServerUrl = ${JSON.stringify(url)}; export default replServerUrl;`;
      }
      return null;
    },

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/repl/repl-sw.js') {
          try {
            const result = await esbuild.build({
              entryPoints: [swPath],
              bundle: true,
              format: 'iife',
              write: false,
            });

            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-cache, max-age=0');
            res.writeHead(200);
            res.write(result.outputFiles![0].text);
            res.end();
            return;
          } catch (e) {
            console.error(e);
          }
        }

        if (req.url?.startsWith('/@builder.io/qwik/')) {
          // local dev wires up the qwik submodules to the local build
          try {
            const buildDir = join(__dirname, '..', 'qwik', 'dist');
            const parts = req.url.replace('/@builder.io/qwik/', '').split('/');
            const submodulePath = join(buildDir, ...parts);

            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-cache, max-age=0');
            res.setHeader('X-Local-Submodule', submodulePath);
            res.writeHead(200);
            res.write(readFileSync(submodulePath, 'utf-8'));
            res.end();
            return;
          } catch (e) {
            console.error(e);
          }
        }

        if (req.url && req.url.includes('/repl/~repl-server-')) {
          try {
            const html = readFileSync(srcReplServerHtml, 'utf-8');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, max-age=0');
            res.writeHead(200);
            res.write(html);
            res.end();
            return;
          } catch (e) {
            console.error(e);
          }
        }

        next();
      });
    },

    generateBundle(opts, bundles) {
      if (opts.format === 'es') {
        for (const f in bundles) {
          const bundle = bundles[f];
          if (bundle.type === 'chunk') {
            if (bundle.name === 'repl-service-worker') {
              this.emitFile({
                type: 'asset',
                fileName: 'repl/repl-sw.js',
                source: bundle.code,
              });
            }
          }
        }
      }
    },
  };
}
