import type { Plugin } from 'vite';
import { resolve, join } from 'path';
import { readFileSync } from 'fs';
import esbuild from 'esbuild';

export function replServiceWorker(): Plugin {
  return {
    name: 'replServiceWorker',

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/repl/repl-sw.js') {
          try {
            const swPath = resolve('src', 'components', 'repl', 'worker', 'repl-service-worker.ts');

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

export function replServerHtml(): Plugin {
  return {
    name: 'replServiceWorker',

    resolveId(id) {
      if (id === '@repl-server-html') {
        return '\0@repl-server-html';
      }
      return null;
    },

    load(id) {
      if (id === '\0@repl-server-html') {
        const srcReplServerHtml = resolve('public', 'repl', 'repl-server.html');
        const replServerHtml = readFileSync(srcReplServerHtml, 'utf-8');
        return `const replServerHtml = ${JSON.stringify(
          replServerHtml
        )}; export default replServerHtml;`;
      }
      return null;
    },
  };
}
