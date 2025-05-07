/* eslint-disable no-console */
import type { Render, RenderToStreamOptions } from '@builder.io/qwik/server';
import type { IncomingMessage, ServerResponse } from 'http';
import { magenta } from 'kleur/colors';

import type { Connect, ViteDevServer } from 'vite';
import { SYNC_QRL } from '../../../core/qrl/qrl-class';
import type {
  OptimizerSystem,
  Path,
  ServerQwikManifest,
  SymbolMapper,
  SymbolMapperFn,
} from '../types';
import clickToComponent from './click-to-component.html?raw';
import errorHost from './error-host.html?raw';
import imageDevTools from './image-size-runtime.html?raw';
import perfWarning from './perf-warning.html?raw';
import { type NormalizedQwikPluginOptions } from './plugin';
import type { QwikViteDevResponse } from './vite';
import { VITE_ERROR_OVERLAY_STYLES } from './vite-error';
import { formatError, parseId } from './vite-utils';

function getOrigin(req: IncomingMessage) {
  const { PROTOCOL_HEADER, HOST_HEADER } = process.env;
  const headers = req.headers;
  const protocol =
    (PROTOCOL_HEADER && headers[PROTOCOL_HEADER.toLowerCase()]) ||
    ((req.socket as any).encrypted || (req.connection as any).encrypted ? 'https' : 'http');
  const host =
    (HOST_HEADER && headers[HOST_HEADER.toLowerCase()]) || headers[':authority'] || headers['host'];

  return `${protocol}://${host}`;
}

function createSymbolMapper(base: string): SymbolMapperFn {
  return (
    symbolName: string,
    _mapper: SymbolMapper | undefined,
    parent: string | undefined
  ): [string, string] => {
    if (symbolName === SYNC_QRL) {
      return [symbolName, ''];
    }
    if (!parent) {
      console.error(
        'qwik vite-dev-server symbolMapper: unknown qrl requested without parent:',
        symbolName
      );
      return [symbolName, `${base}${symbolName}.js`];
    }
    // In dev mode, the `parent` is the Vite URL for the parent, not the real absolute path.
    // It is always absolute but when on Windows that's without a /
    const qrlFile = `${base}${parent.startsWith('/') ? parent.slice(1) : parent}_${symbolName}.js`;
    return [symbolName, qrlFile];
  };
}

let lazySymbolMapper: ReturnType<typeof createSymbolMapper> | null = null;
/**
 * @alpha
 *   For a given symbol (QRL such as `onKeydown$`) the server needs to know which bundle the symbol is in.
 *
 *   Normally this is provided by Qwik's `q-manifest` . But `q-manifest` only exists after a full client build.
 *
 *   This would be a problem in dev mode. So in dev mode the symbol is mapped to the expected URL using the symbolMapper function below. For Vite the given path is fixed for a given symbol.
 */
export let symbolMapper: ReturnType<typeof createSymbolMapper> = (symbolName, mapper, parent) => {
  // This is a fallback in case the symbolMapper is copied early
  if (lazySymbolMapper) {
    return lazySymbolMapper(symbolName, mapper, parent);
  }
  throw new Error('symbolMapper not initialized');
};

export async function configureDevServer(
  base: string,
  server: ViteDevServer,
  opts: NormalizedQwikPluginOptions,
  sys: OptimizerSystem,
  path: Path,
  isClientDevOnly: boolean,
  clientDevInput: string | undefined,
  devSsrServer: boolean
) {
  symbolMapper = lazySymbolMapper = createSymbolMapper(base);
  if (!devSsrServer) {
    // we just needed the symbolMapper
    return;
  }
  const hasQwikCity = server.config.plugins?.some(
    (plugin) => plugin.name === 'vite-plugin-qwik-city'
  );

  // to maintain css importers after HMR
  const cssImportedByCSS = new Set<string>();

  // qwik middleware injected BEFORE vite internal middlewares
  server.middlewares.use(async (req, res, next) => {
    try {
      const { ORIGIN } = process.env;
      const domain = ORIGIN ?? getOrigin(req);
      const url = new URL(req.originalUrl!, domain);

      if (shouldSsrRender(req, url)) {
        const { _qwikEnvData } = res as QwikViteDevResponse;
        if (!_qwikEnvData && hasQwikCity) {
          console.error(`not SSR rendering ${url} because Qwik City Env data did not populate`);
          res.statusCode ||= 404;
          res.setHeader('Content-Type', 'text/plain');
          res.writeHead(res.statusCode);
          res.end('Not a SSR URL according to Qwik City');
          return;
        }
        const serverData: Record<string, any> = {
          ..._qwikEnvData,
          url: url.href,
        };

        const status = typeof res.statusCode === 'number' ? res.statusCode : 200;
        if (isClientDevOnly) {
          const relPath = path.relative(opts.rootDir, clientDevInput!);
          const entryUrl = '/' + relPath.replace(/\\/g, '/');

          let html = getViteDevIndexHtml(entryUrl, serverData);
          html = await server.transformIndexHtml(url.pathname, html);

          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('X-Powered-By', 'Qwik Vite Dev Server');
          res.writeHead(status);

          res.end(html);
          return;
        }

        const firstInput = opts.input && Object.values(opts.input)[0];
        const ssrModule = await server.ssrLoadModule(firstInput);

        const render: Render = ssrModule.default ?? ssrModule.render;

        if (typeof render === 'function') {
          const manifest: ServerQwikManifest = {
            manifestHash: '',
            mapping: {},
            injections: [],
          };

          const added = new Set();
          const CSS_EXTENSIONS = ['.css', '.scss', '.sass', '.less', '.styl', '.stylus'];
          const JS_EXTENSIONS = /\.[mc]?[tj]sx?$/;

          Array.from(server.moduleGraph.fileToModulesMap.entries()).forEach((entry) => {
            entry[1].forEach((v) => {
              const segment = v.info?.meta?.segment;
              let url = v.url;
              if (v.lastHMRTimestamp) {
                url += `?t=${v.lastHMRTimestamp}`;
              }
              if (segment) {
                manifest.mapping[segment.name] = relativeURL(url, opts.rootDir);
              }

              const { pathId, query } = parseId(v.url);

              if (query === '' && CSS_EXTENSIONS.some((ext) => pathId.endsWith(ext))) {
                const isEntryCSS = v.importers.size === 0;
                const hasCSSImporter = Array.from(v.importers).some((importer) => {
                  const importerPath = (importer as typeof v).url || (importer as typeof v).file;

                  const isCSS =
                    importerPath && CSS_EXTENSIONS.some((ext) => importerPath.endsWith(ext));

                  if (isCSS && v.url) {
                    cssImportedByCSS.add(v.url);
                  }

                  return isCSS;
                });

                const hasJSImporter = Array.from(v.importers).some((importer) => {
                  const importerPath = (importer as typeof v).url || (importer as typeof v).file;
                  return importerPath && JS_EXTENSIONS.test(importerPath);
                });

                if (
                  (isEntryCSS || hasJSImporter) &&
                  !hasCSSImporter &&
                  !cssImportedByCSS.has(v.url) &&
                  !added.has(v.url)
                ) {
                  added.add(v.url);
                  manifest.injections!.push({
                    tag: 'link',
                    location: 'head',
                    attributes: {
                      rel: 'stylesheet',
                      href: `${base}${url.slice(1)}`,
                    },
                  });
                }
              }
            });
          });

          const renderOpts: RenderToStreamOptions = {
            debug: true,
            locale: serverData.locale,
            stream: res,
            snapshot: !isClientDevOnly,
            manifest: isClientDevOnly ? undefined : manifest,
            symbolMapper: isClientDevOnly ? undefined : symbolMapper,
            serverData,
            containerAttributes: { ...serverData.containerAttributes },
          };

          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('X-Powered-By', 'Qwik Vite Dev Server');
          res.writeHead(status);

          const result = await render(renderOpts);

          // End stream
          if ('html' in result) {
            res.write((result as any).html);
          }

          // Sometimes new CSS files are added after the initial render
          Array.from(server.moduleGraph.fileToModulesMap.entries()).forEach((entry) => {
            entry[1].forEach((v) => {
              const { pathId, query } = parseId(v.url);
              if (
                !added.has(v.url) &&
                query === '' &&
                CSS_EXTENSIONS.some((ext) => pathId.endsWith(ext))
              ) {
                const isEntryCSS = v.importers.size === 0;
                const hasCSSImporter = Array.from(v.importers).some((importer) => {
                  const importerPath = (importer as typeof v).url || (importer as typeof v).file;

                  const isCSS =
                    importerPath && CSS_EXTENSIONS.some((ext) => importerPath.endsWith(ext));

                  if (isCSS && v.url) {
                    cssImportedByCSS.add(v.url);
                  }

                  return isCSS;
                });

                const hasJSImporter = Array.from(v.importers).some((importer) => {
                  const importerPath = (importer as typeof v).url || (importer as typeof v).file;
                  return importerPath && JS_EXTENSIONS.test(importerPath);
                });

                if (
                  (isEntryCSS || hasJSImporter) &&
                  !hasCSSImporter &&
                  !cssImportedByCSS.has(v.url)
                ) {
                  res.write(`<link rel="stylesheet" href="${base}${v.url.slice(1)}">`);
                  added.add(v.url);
                }
              }
            });
          });

          res.write(
            END_SSR_SCRIPT(opts, opts.srcDir ? opts.srcDir : path.join(opts.rootDir, 'src'))
          );
          res.end();
        } else {
          next();
        }
      } else {
        next();
      }
    } catch (e: any) {
      if (e instanceof Error) {
        server.ssrFixStacktrace(e);
        await formatError(sys, e);
      }
      next(e);
    } finally {
      if (typeof (res as QwikViteDevResponse)._qwikRenderResolve === 'function') {
        (res as QwikViteDevResponse)._qwikRenderResolve!();
      }
    }
  });

  server.middlewares.use(function (err: any, _req: any, res: ServerResponse, next: any) {
    if (!res.writableEnded) {
      res.write(`<style>${VITE_ERROR_OVERLAY_STYLES}</style>`);
    }
    return next(err);
  });

  setTimeout(() => {
    console.log(
      `\n  🚧 ${magenta('Please note that development mode is slower than production.')}`
    );
  }, 1000);
}

export async function configurePreviewServer(
  middlewares: Connect.Server,
  ssrOutDir: string,
  sys: OptimizerSystem,
  path: Path
) {
  const fs: typeof import('fs') = await sys.dynamicImport('node:fs');
  const url: typeof import('url') = await sys.dynamicImport('node:url');

  const entryPreviewPaths = ['mjs', 'cjs', 'js'].map((ext) =>
    path.join(ssrOutDir, `entry.preview.${ext}`)
  );

  const entryPreviewModulePath = entryPreviewPaths.find((p) => fs.existsSync(p));
  if (!entryPreviewModulePath) {
    return invalidPreviewMessage(
      middlewares,
      `Unable to find output "${ssrOutDir}/entry.preview" module.\n\nPlease ensure "src/entry.preview.tsx" has been built before the "preview" command.`
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

const CYPRESS_DEV_SERVER_PATH = '/__cypress/src';
const FS_PREFIX = `/@fs/`;
const VALID_ID_PREFIX = `/@id/`;
const VITE_PUBLIC_PATH = `/@vite/`;
const internalPrefixes = [FS_PREFIX, VALID_ID_PREFIX, VITE_PUBLIC_PATH];
const InternalPrefixRE = new RegExp(
  `^(${CYPRESS_DEV_SERVER_PATH})?(?:${internalPrefixes.join('|')})`
);

const shouldSsrRender = (req: IncomingMessage, url: URL) => {
  const pathname = url.pathname;
  if (/\.[\w?=&]+$/.test(pathname) && !pathname.endsWith('.html')) {
    // has extension
    return false;
  }
  if (pathname.includes('_-vite-ping')) {
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
  if (pathname.includes('@builder.io/qwik/build')) {
    return false;
  }
  const acceptHeader = req.headers.accept || '';
  const accepts = acceptHeader.split(',').map((accept) => accept.split(';')[0]);
  if (accepts.length == 1 && accepts.includes('*/*')) {
    // special case for curl where the default is `*/*` with no additional headers
    return true;
  }

  if (!accepts.includes('text/html')) {
    return false;
  }
  return true;
};

declare global {
  interface Window {
    __qwik_inspector_state: {
      pressedKeys: string[];
      hoveredElement?: EventTarget | null;
    };
  }
}

function relativeURL(url: string, base: string) {
  if (url.startsWith(base)) {
    url = url.slice(base.length);
    if (!url.startsWith('/')) {
      url = '/' + url;
    }
  }
  return url;
}

const DEV_QWIK_INSPECTOR = (opts: NormalizedQwikPluginOptions['devTools'], srcDir: string) => {
  const qwikdevtools = {
    hotKeys: opts.clickToSource ?? [],
    srcDir: new URL(srcDir + '/', 'http://local.local').href,
  };
  return (
    `<script>
      globalThis.qwikdevtools = ${JSON.stringify(qwikdevtools)};
    </script>` +
    (opts.imageDevTools ? imageDevTools : '') +
    (opts.clickToSource ? clickToComponent : '')
  );
};

const END_SSR_SCRIPT = (opts: NormalizedQwikPluginOptions, srcDir: string) => `
<style>${VITE_ERROR_OVERLAY_STYLES}</style>
<script type="module" src="/@vite/client"></script>
${errorHost}
${perfWarning}
${DEV_QWIK_INSPECTOR(opts.devTools, srcDir)}
`;

function getViteDevIndexHtml(entryUrl: string, serverData: Record<string, any>) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
  </head>
  <body>
    <script type="module">
    async function main() {
      const mod = await import("${entryUrl}?${VITE_DEV_CLIENT_QS}=");
      if (mod.default) {
        const serverData = JSON.parse(${JSON.stringify(JSON.stringify(serverData))})
        mod.default({
          serverData,
        });
      }
    }
    main();
    </script>
    ${errorHost}
  </body>
</html>`;
}

export const VITE_DEV_CLIENT_QS = `qwik-vite-dev-client`;
