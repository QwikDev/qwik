/* eslint-disable no-console */
import type { Render, RenderToStreamOptions } from '@builder.io/qwik/server';
import type { IncomingMessage } from 'http';
import type { Connect, ViteDevServer } from 'vite';
import type { OptimizerSystem, Path, QwikManifest } from '../types';
import { ERROR_HOST } from './errored-host';
import { NormalizedQwikPluginOptions, parseId } from './plugin';
import type { QwikViteDevResponse } from './vite';
import { formatError } from './vite-utils';
import { getErrorMarkdown, logError, VITE_ERROR_OVERLAY_STYLES } from './vite-error';
import type { RollupError } from 'rollup';

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
        const undici = await sys.strictDynamicImport('undici');
        global.fetch = undici.fetch;
        global.Headers = undici.Headers;
        global.Request = undici.Request;
        global.Response = undici.Response;
        global.FormData = undici.FormData;
      }
    } catch {
      console.warn('Global fetch() was not installed');
      // Nothing
    }
  }

  // qwik middleware injected BEFORE vite internal middlewares
  // note the 4 args must be kept for connect to treat this as error middleware
  server.middlewares.use(async (err: RollupError, req: any, res: any, next: any) => {
    if (err) {
      logError(server, err);
      res.statusCode = 500;
      res.end(getErrorMarkdown(err));
      return;
    }

    try {
      const domain = 'http://' + (req.headers.host ?? 'localhost');
      const url = new URL(req.originalUrl!, domain);

      if (shouldSsrRender(req, url)) {
        const serverData: Record<string, any> = {
          ...(res as QwikViteDevResponse)._qwikEnvData,
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

          const added = new Set();
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
                added.add(url);
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
            locale: serverData.locale,
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
            serverData,
          };

          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('X-Powered-By', 'Qwik Vite Dev Server');
          res.writeHead(status);

          const result = await render(renderOpts);

          // Sometimes new CSS files are added after the initial render
          Array.from(server.moduleGraph.fileToModulesMap.entries()).forEach((entry) => {
            entry[1].forEach((v) => {
              const { pathId, query } = parseId(v.url);
              if (
                !added.has(v.url) &&
                query === '' &&
                ['.css', '.scss', '.sass'].some((ext) => pathId.endsWith(ext))
              ) {
                res.write(`<link rel="stylesheet" href="${v.url}">`);
              }
            });
          });

          // End stream
          if ('html' in result) {
            res.write((result as any).html);
          }
          res.write(END_SSR_SCRIPT(opts));
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
  const style = document.createElement('style');
  style.textContent = ${VITE_ERROR_OVERLAY_STYLES};
  
  document.head.appendChild(style);
  document.body.appendChild(overlay);
});
</script>`;

declare global {
  interface Window {
    __qwik_inspector_state: {
      pressedKeys: string[];
      hoveredElement?: EventTarget | null;
    };
  }
}

const DEV_QWIK_INSPECTOR = (opts: NormalizedQwikPluginOptions['devTools']) => {
  if (!opts.clickToSource) {
    // click to source set to false means no inspector
    return '';
  }

  const hotKeys: string[] = opts.clickToSource;

  return `
<style>
#qwik-inspector-overlay {
  position: fixed;
  background: rgba(24, 182, 246, 0.27);
  pointer-events: none;
  box-sizing: border-box;
  border: 2px solid rgba(172, 126, 244, 0.46);
  border-radius: 4px;
  contain: strict;
  cursor: pointer;
  z-index: 999999;
}
#qwik-inspector-info-popup {
  position: fixed;
  bottom: 10px;
  right: 10px;
  font-family: monospace;
  background: #000000c2;
  color: white;
  padding: 10px 20px;
  border-radius: 8px;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 34%), 0 8px 10px -6px rgb(0 0 0 / 24%);
  backdrop-filter: blur(4px);
  -webkit-animation: fadeOut 0.3s 3s ease-in-out forwards;
  animation: fadeOut 0.3s 3s ease-in-out forwards;
  z-index: 999999;
}
#qwik-inspector-info-popup p {
  margin: 0px;
}
@-webkit-keyframes fadeOut {
  0% {opacity: 1;}
  100% {opacity: 0;}
}

@keyframes fadeOut {
  0% {opacity: 1;}
  100% {opacity: 0; visibility: hidden;}
}
</style>
<script>
(function() {
  console.debug("%c🔍 Qwik Click-To-Source","background: #564CE0; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;","Hold-press the '${hotKeys.join(
    ' + '
  )}' key${
    (hotKeys.length > 1 && 's') || ''
  } and click a component to jump directly to the source code in your IDE!");
  window.__qwik_inspector_state = {
    pressedKeys: new Set(),
  };

  const body = document.body;
  const overlay = document.createElement('div');
  overlay.id = 'qwik-inspector-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  body.appendChild(overlay);

  document.addEventListener(
    'keydown',
    (event) => {
      window.__qwik_inspector_state.pressedKeys.add(event.code);
      updateOverlay();
    },
    { capture: true }
  );

  document.addEventListener(
    'keyup',
    (event) => {
      window.__qwik_inspector_state.pressedKeys.delete(event.code);
      updateOverlay();
    },
    { capture: true }
  );

  document.addEventListener(
    'mouseover',
    (event) => {
      if (event.target && event.target instanceof HTMLElement && event.target.dataset.qwikInspector) {
        window.__qwik_inspector_state.hoveredElement = event.target;
      } else {
        window.__qwik_inspector_state.hoveredElement = undefined;
      }
      updateOverlay();
    },
    { capture: true }
  );

  document.addEventListener(
    'click',
    (event) => {
      if (isActive()) {
        window.__qwik_inspector_state.pressedKeys.clear();
        if (event.target && event.target instanceof HTMLElement) {
          if (event.target.dataset.qwikInspector) {
            event.preventDefault();
            body.style.setProperty('cursor', 'progress');

            fetch('/__open-in-editor?file=' + event.target.dataset.qwikInspector);
          }
        }
      }
    },
    { capture: true }
  );

  document.addEventListener(
    'contextmenu',
    (event) => {
      if (isActive()) {
        window.__qwik_inspector_state.pressedKeys.clear();
        if (event.target && event.target instanceof HTMLElement) {
          if (event.target.dataset.qwikInspector) {
            event.preventDefault();
          }
        }
      }
    },
    { capture: true }
  );

  function updateOverlay() {
    const hoverElement = window.__qwik_inspector_state.hoveredElement;
    if (hoverElement && isActive()) {
      const rect = hoverElement.getBoundingClientRect();
      overlay.style.setProperty('height', rect.height + 'px');
      overlay.style.setProperty('width', rect.width + 'px');
      overlay.style.setProperty('top', rect.top + 'px');
      overlay.style.setProperty('left', rect.left + 'px');
      overlay.style.setProperty('visibility', 'visible');
      body.style.setProperty('cursor', 'pointer');
    } else {
      overlay.style.setProperty('height', '0px');
      overlay.style.setProperty('width', '0px');
      overlay.style.setProperty('visibility', 'hidden');
      body.style.removeProperty('cursor');
    }
  }

  function checkKeysArePressed() {
    const activeKeys = Array.from(window.__qwik_inspector_state.pressedKeys)
      .map((key) => key ? key.replace(/(Left|Right)$/g, '') : undefined);
    const clickToSourceKeys = ${JSON.stringify(hotKeys)};
    return clickToSourceKeys.every((key) => activeKeys.includes(key));
  }

  function isActive() {
    return checkKeysArePressed();
  }

  window.addEventListener('resize', updateOverlay);
  document.addEventListener('scroll', updateOverlay);

})();
</script>
<div id="qwik-inspector-info-popup" aria-hidden="true">Click-to-Source: ${hotKeys.join(
    ' + '
  )}</p></div>
`;
};

const PERF_WARNING = `
<script>
if (!window.__qwikViteLog) {
  window.__qwikViteLog = true;
  console.debug("%c⭐️ Qwik Dev SSR Mode","background: #0c75d2; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;","App is running in SSR development mode!\\n - Additional JS is loaded by Vite for debugging and live reloading\\n - Rendering performance might not be optimal\\n - Delayed interactivity because prefetching is disabled\\n - Vite dev bundles do not represent production output\\n\\nProduction build can be tested running 'npm run preview'");
}
</script>`;

const END_SSR_SCRIPT = (opts: NormalizedQwikPluginOptions) => `
<script type="module" src="/@vite/client"></script>
${DEV_ERROR_HANDLING}
${ERROR_HOST}
${PERF_WARNING}
${DEV_QWIK_INSPECTOR(opts.devTools)}
`;

function getViteDevIndexHtml(entryUrl: string, serverData: Record<string, any>) {
  return `<!DOCTYPE html>
<html>
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
