/* eslint-disable no-console */
import type { Render, RenderToStreamOptions } from '@builder.io/qwik/server';
import type { IncomingMessage } from 'http';
import type { Connect, ViteDevServer } from 'vite';
import type { OptimizerSystem, Path, QwikManifest } from '../types';
import { ERROR_HOST } from './errored-host';
import { NormalizedQwikPluginOptions, parseId } from './plugin';
import type { QwikViteDevResponse } from './vite';
import { formatError } from './vite-utils';

export async function configureDevServer(
  server: ViteDevServer,
  opts: NormalizedQwikPluginOptions,
  sys: OptimizerSystem,
  path: Path,
  isClientDevOnly: boolean,
  clientDevInput: string | undefined
) {
  if (typeof fetch !== 'function' && sys.env === 'node') {
    // polyfill fetch() when not available in NodeJS

    try {
      if (!globalThis.fetch) {
        const nodeFetch = await sys.strictDynamicImport('node-fetch');
        global.fetch = nodeFetch;
        global.Headers = nodeFetch.Headers;
        global.Request = nodeFetch.Request;
        global.Response = nodeFetch.Response;
      }
    } catch {
      console.warn('Global fetch() was not installed');
      // Nothing
    }
  }

  // qwik middleware injected BEFORE vite internal middlewares
  server.middlewares.use(async (req, res, next) => {
    try {
      const domain = 'http://' + (req.headers.host ?? 'localhost');
      const url = new URL(req.originalUrl!, domain);

      if (shouldSsrRender(req, url)) {
        const envData: Record<string, any> = {
          ...(res as QwikViteDevResponse)._qwikEnvData,
          url: url.href,
        };

        const status = typeof res.statusCode === 'number' ? res.statusCode : 200;
        if (isClientDevOnly) {
          const relPath = path.relative(opts.rootDir, clientDevInput!);
          const entryUrl = '/' + relPath.replace(/\\/g, '/');

          let html = getViteDevIndexHtml(entryUrl, envData);
          html = await server.transformIndexHtml(url.pathname, html);

          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('X-Powered-By', 'Qwik Vite Dev Server');
          res.writeHead(status);

          res.end(html);
          return;
        }

        const ssrModule = await server.ssrLoadModule(opts.input[0], {
          fixStacktrace: false,
        });

        const render: Render = ssrModule.default ?? ssrModule.render;

        if (typeof render === 'function') {
          const manifest: QwikManifest = {
            symbols: {},
            mapping: {},
            bundles: {},
            injections: [],
            version: '1',
          };

          Array.from(server.moduleGraph.fileToModulesMap.entries()).forEach((entry) => {
            entry[1].forEach((v) => {
              const hook = v.info?.meta?.hook;
              let url = v.url;
              if (v.lastHMRTimestamp) {
                url += `?t=${v.lastHMRTimestamp}`;
              }
              if (hook) {
                manifest.mapping[hook.name] = url;
              }

              const { pathId, query } = parseId(v.url);
              if (query === '' && ['.css', '.scss', '.sass'].some((ext) => pathId.endsWith(ext))) {
                manifest.injections!.push({
                  tag: 'link',
                  location: 'head',
                  attributes: {
                    rel: 'stylesheet',
                    href: url,
                  },
                });
              }
            });
          });

          const renderOpts: RenderToStreamOptions = {
            debug: true,
            stream: res,
            snapshot: !isClientDevOnly,
            manifest: isClientDevOnly ? undefined : manifest,
            symbolMapper: isClientDevOnly
              ? undefined
              : (symbolName, mapper) => {
                  if (mapper) {
                    const hash = getSymbolHash(symbolName);
                    return mapper[hash];
                  }
                },
            prefetchStrategy: null,
            envData: envData,
          };

          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('X-Powered-By', 'Qwik Vite Dev Server');
          res.writeHead(status);

          const result = await render(renderOpts);
          if ('html' in result) {
            res.write(END_SSR_SCRIPT);
            res.end((result as any).html);
          } else {
            res.write(END_SSR_SCRIPT);
            res.end();
          }
        } else {
          next();
        }
      } else {
        next();
      }
    } catch (e: any) {
      server.ssrFixStacktrace(e);
      if (e instanceof Error) {
        await formatError(sys, e);
      }
      next(e);
    }
  });
}

export async function configurePreviewServer(
  middlewares: Connect.Server,
  opts: NormalizedQwikPluginOptions,
  sys: OptimizerSystem,
  path: Path
) {
  const fs: typeof import('fs') = await sys.dynamicImport('node:fs');
  const url: typeof import('url') = await sys.dynamicImport('node:url');

  const entryPreviewPaths = ['mjs', 'cjs', 'js'].map((ext) =>
    path.join(opts.rootDir, 'server', `entry.preview.${ext}`)
  );

  const entryPreviewModulePath = entryPreviewPaths.find((p) => fs.existsSync(p));
  if (!entryPreviewModulePath) {
    return invalidPreviewMessage(
      middlewares,
      `Unable to find output "server/entry.preview" module.\n\nPlease ensure "src/entry.preview.tsx" has been built before the "preview" command.`
    );
  }

  try {
    const entryPreviewImportPath = url.pathToFileURL(entryPreviewModulePath).href;
    const previewModuleImport = await sys.strictDynamicImport(entryPreviewImportPath);

    let previewMiddleware: Connect.HandleFunction | null = null;
    let preview404Middleware: Connect.HandleFunction | null = null;

    if (previewModuleImport.default) {
      if (typeof previewModuleImport.default === 'function') {
        previewMiddleware = previewModuleImport.default;
      } else if (typeof previewModuleImport.default === 'object') {
        previewMiddleware = previewModuleImport.default.router;
        preview404Middleware = previewModuleImport.default.notFound;
      }
    }

    if (typeof previewMiddleware !== 'function') {
      return invalidPreviewMessage(
        middlewares,
        `Entry preview module "${entryPreviewModulePath}" does not export a default middleware function`
      );
    }

    middlewares.use(previewMiddleware);

    if (typeof preview404Middleware === 'function') {
      middlewares.use(preview404Middleware);
    }
  } catch (e) {
    return invalidPreviewMessage(middlewares, String(e));
  }
}

function invalidPreviewMessage(middlewares: Connect.Server, msg: string) {
  console.log(`\n❌ ${msg}\n`);

  middlewares.use((_, res) => {
    res.writeHead(400, {
      'Content-Type': 'text/plain',
    });
    res.end(msg);
  });
}

const FS_PREFIX = `/@fs/`;
const VALID_ID_PREFIX = `/@id/`;
const VITE_PUBLIC_PATH = `/@vite/`;
const internalPrefixes = [FS_PREFIX, VALID_ID_PREFIX, VITE_PUBLIC_PATH];
const InternalPrefixRE = new RegExp(`^(?:${internalPrefixes.join('|')})`);

const shouldSsrRender = (req: IncomingMessage, url: URL) => {
  const pathname = url.pathname;
  if (/\.[\w?=&]+$/.test(pathname) && !pathname.endsWith('.html')) {
    // has extension
    return false;
  }
  if (pathname.includes('__vite_ping')) {
    return false;
  }
  if (pathname.includes('__open-in-editor')) {
    return false;
  }
  if (url.searchParams.has('html-proxy')) {
    return false;
  }
  if (url.searchParams.get('ssr') === 'false') {
    return false;
  }
  if (InternalPrefixRE.test(url.pathname)) {
    return false;
  }
  const acceptHeader = req.headers.accept || '';
  if (!acceptHeader.includes('text/html')) {
    return false;
  }
  return true;
};

const DEV_ERROR_HANDLING = `
<script>

document.addEventListener('qerror', ev => {
  const ErrorOverlay = customElements.get('vite-error-overlay');
  if (!ErrorOverlay) {
    return;
  }
  const err = ev.detail.error;
  const overlay = new ErrorOverlay(err);
  document.body.appendChild(overlay);
});
</script>`;

const PERF_WARNING = `
<script>
if (!window.__qwikViteLog) {
  window.__qwikViteLog = true;
  console.debug("%c⭐️ Qwik Dev SSR Mode","background: #0c75d2; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;","App is running in SSR development mode!\\n - Additional JS is loaded by Vite for debugging and live reloading\\n - Rendering performance might not be optimal\\n - Delayed interactivity because prefetching is disabled\\n - Vite dev bundles do not represent production output\\n\\nProduction build can be tested running 'npm run preview'");
}
</script>`;

const END_SSR_SCRIPT = `
<script type="module" src="/@vite/client"></script>
${DEV_ERROR_HANDLING}
${ERROR_HOST}
${PERF_WARNING}
`;

function getViteDevIndexHtml(entryUrl: string, envData: Record<string, any>) {
  return `<!DOCTYPE html>
<html>
  <head>
  </head>
  <body>
    <script type="module">
    async function main() {
      const mod = await import("${entryUrl}?${VITE_DEV_CLIENT_QS}=");
      if (mod.default) {
        const envData = JSON.parse(${JSON.stringify(JSON.stringify(envData))})
        mod.default({
          envData,
        });
      }
    }
    main();
    </script>
    ${DEV_ERROR_HANDLING}
  </body>
</html>`;
}

export const VITE_DEV_CLIENT_QS = `qwik-vite-dev-client`;

export const getSymbolHash = (symbolName: string) => {
  const index = symbolName.lastIndexOf('_');
  if (index > -1) {
    return symbolName.slice(index + 1);
  }
  return symbolName;
};
