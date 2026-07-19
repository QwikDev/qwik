import type { Render } from '@qwik.dev/router/middleware/request-handler';
import type { RendererOptions } from '@qwik.dev/router';
import type { Connect, ViteDevServer } from 'vite';
import type { LoaderInternal } from '../../runtime/src/types';
import { isPageExt, normalizePath } from '../../utils/fs';
import {
  IsQLoader,
  recognizeRequest,
  resolveValidInternalFullPathname,
  trimRecognizedInternalPathname,
} from '../../middleware/request-handler/request-path';
import { devPreloadedRouteLoaders } from '../../middleware/request-handler/dev-preloaded-route-loader';
import { updateRoutingContext } from '../build';
import { routeSortCompare } from '../routing/sort-routes';
import type { RoutingContext } from '../types';
import { formatError } from './format-error';
import { wrapResponseForHtmlTransform } from './html-transform-wrapper';
import { getImportPath } from '../runtime-generation/utils';

const FULLPATH_HEADER = 'X-Qwik-fullpath';
const ROUTE_PATH_HEADER = 'X-Qwik-route-path';
type DevServerRequest = Parameters<Connect.NextHandleFunction>[0];

export function getDevMiddlewareRequestPath(req: DevServerRequest) {
  return (req as any).originalUrl || req.url;
}

export const makeRouterDevMiddleware =
  (server: ViteDevServer, ctx: RoutingContext): Connect.NextHandleFunction =>
  async (req, res, next) => {
    // This middleware is the fallback for Vite dev mode; it renders the application

    // TODO more flexible entry points, like importing `render` from `src/server`
    // TODO pick a better name, entry.server-renderer perhaps?
    let mod: { default: Render };
    try {
      mod = (await server.ssrLoadModule('src/entry.ssr')) as { default: Render };
    } catch (e) {
      // Pass through so hosts without an entry.ssr (e.g. Storybook) can handle the request
      // themselves instead of crashing the dev server with an unhandled rejection.
      if (e instanceof Error) {
        server.ssrFixStacktrace(e);
      }
      return next();
    }
    if (!mod.default) {
      console.error('No default export found in src/entry.ssr');
      return next();
    }
    const renderer = mod.default;
    if (ctx!.isDirty) {
      await updateRoutingContext(ctx!);
      ctx!.isDirty = false;
    }
    const preloadedRouteLoader = await preloadQLoaderRouteLoader(server, ctx!, req);
    if (preloadedRouteLoader) {
      await server.ssrLoadModule('@qwik-router-config');
      devPreloadedRouteLoaders.set(req, preloadedRouteLoader);
    }

    // entry.ts files
    const entry = ctx!.entries.find((e) => req.url === `${server.config.base}${e.chunkFileName}`);
    if (entry) {
      const entryContents = await server.transformRequest(
        `/@fs${entry.filePath.startsWith('/') ? '' : '/'}${entry.filePath}`
      );

      if (entryContents) {
        // For entry files, we don't need HTML transformation, so use original response
        res.setHeader('Content-Type', 'text/javascript');
        res.end(entryContents.code);
      } else {
        next();
      }
      return;
    }
    // serve a placeholder service worker, because we can't provide CJS bundles in dev mode
    // once we support ESM service workers, we can remove this
    if (req.url === `${server.config.base}service-worker.js`) {
      // For service worker, we don't need HTML transformation, so use original response
      res.setHeader('Content-Type', 'text/javascript');
      res.end(
        `/* Qwik Router Dev Service Worker */` +
          `self.addEventListener('install', () => self.skipWaiting());` +
          `self.addEventListener('activate', (ev) => ev.waitUntil(self.clients.claim()));`
      );
      return;
    }

    // We'll be reloading the Qwik module, that's fine, don't let it warn
    (globalThis as any).__qwik = undefined;
    // Now we can stream the render
    const { createQwikRouter } = (await server.ssrLoadModule(
      '@qwik.dev/router/middleware/node'
    )) as typeof import('@qwik.dev/router/middleware/node');
    try {
      const render = (async (opts: RendererOptions) => {
        return await renderer(opts as any);
      }) as Render;
      const { router, staticFile } = createQwikRouter({
        render,
        // inject the platform from dev middleware options
        platform: ctx.opts.platform,
      } as any);

      // Wrap the response to enable HTML transformation
      const wrappedRes = wrapResponseForHtmlTransform(req, res, server);

      staticFile(req, wrappedRes, () => {
        router(req, wrappedRes, next);
      });
    } catch (e: any) {
      if (e instanceof Error) {
        server.ssrFixStacktrace(e);
        formatError(e);
      }
      next(e);
      return;
    }
  };

async function preloadQLoaderRouteLoader(
  server: ViteDevServer,
  ctx: RoutingContext,
  req: DevServerRequest
) {
  const requestPath = getDevMiddlewareRequestPath(req);
  if (!requestPath) {
    return undefined;
  }
  let requestUrl: URL;
  try {
    requestUrl = new URL(requestPath, 'http://qwik.dev');
  } catch {
    return undefined;
  }
  const recognized = recognizeRequest(requestUrl.pathname);
  if (recognized?.type !== IsQLoader || !recognized.data?.loaderId) {
    return undefined;
  }

  const loaderId = recognized.data.loaderId;
  const headerValue =
    req.headers[FULLPATH_HEADER.toLowerCase()] ?? req.headers[ROUTE_PATH_HEADER.toLowerCase()];
  const fullPathHeader = Array.isArray(headerValue) ? headerValue[0] : (headerValue ?? null);
  const loaderPathname = trimRecognizedInternalPathname(requestUrl.pathname, recognized);
  const pathname =
    resolveValidInternalFullPathname(loaderPathname, fullPathHeader) ?? loaderPathname;
  const route = ctx.routes
    .filter((route) => isPageExt(route.ext))
    .slice()
    .sort(routeSortCompare)
    .find((route) => route.pattern.test(pathname));
  if (!route) {
    return undefined;
  }

  const routeRootFiles = [...route.layouts.map((layout) => layout.filePath), route.filePath];
  const modules = await Promise.all([
    ...ctx.serverPlugins.map((plugin) => loadSsrModule(server, plugin.filePath)),
    ...routeRootFiles.map((filePath) => loadSsrModule(server, filePath)),
  ]);
  for (const mod of modules) {
    const loader = findMatchingLoader(mod, loaderId);
    if (loader) {
      return loader;
    }
  }
}

async function loadSsrModule(server: ViteDevServer, filePath: string) {
  return server.ssrLoadModule(getImportPath(normalizePath(filePath))) as Promise<
    Record<string, unknown>
  >;
}

function findMatchingLoader(mod: Record<string, unknown>, loaderId: string) {
  for (const value of Object.values(mod)) {
    if (isLoaderInternal(value) && matchesLoaderId(value, loaderId)) {
      return value;
    }
  }
}

function matchesLoaderId(loader: LoaderInternal, loaderId: string) {
  return loader.__id === loaderId || loader.__qrl.getHash() === loaderId;
}

function isLoaderInternal(value: unknown): value is LoaderInternal {
  return typeof value === 'function' && (value as LoaderInternal).__brand === 'server_loader';
}

const CSS_EXTENSIONS = ['.css', '.scss', '.sass', '.less', '.styl', '.stylus'];
const JS_EXTENSIONS = /\.[mc]?[tj]sx?$/;
const isCssPath = (url: string) => CSS_EXTENSIONS.some((ext) => url.endsWith(ext));

/**
 * Qwik handles CSS imports itself, meaning vite doesn't get to see them, so we need to manually
 * inject the CSS URLs.
 *
 * We check both the client and SSR module graphs because on the first page request only the SSR
 * graph has been populated (via ssrLoadModule). The client graph is empty until the browser
 * actually fetches modules through Vite's dev server.
 */
const getCssUrls = (server: ViteDevServer) => {
  const clientGraph = server.environments.client.moduleGraph;
  const ssrGraph = server.environments.ssr.moduleGraph;
  const cssModules = new Set<string>();
  const cssImportedByCSS = new Set<string>();

  for (const graph of [clientGraph, ssrGraph]) {
    for (const mod of graph.idToModuleMap.values()) {
      const [pathId, query] = mod.url.split('?');

      if (!query && isCssPath(pathId)) {
        const isEntryCSS = mod.importers.size === 0;
        const hasCSSImporter = Array.from(mod.importers).some((importer) => {
          const importerPath = importer.url || importer.file;

          const isCSS = importerPath && isCssPath(importerPath);

          if (isCSS && mod.url) {
            cssImportedByCSS.add(mod.url);
          }

          return isCSS;
        });

        const hasJSImporter = Array.from(mod.importers).some((importer) => {
          const importerPath = importer.url || importer.file;
          return importerPath && JS_EXTENSIONS.test(importerPath);
        });

        if ((isEntryCSS || hasJSImporter) && !hasCSSImporter && !cssImportedByCSS.has(mod.url)) {
          cssModules.add(`${mod.url}${mod.lastHMRTimestamp ? `?t=${mod.lastHMRTimestamp}` : ''}`);
          // SSR-only CSS isn't watched by Vite; watch it so edits fire handleHotUpdate.
          if (mod.file) {
            server.watcher.add(mod.file);
          }
        }
      }
    }
  }
  return [...cssModules];
};

export const getRouterIndexTags = (server: ViteDevServer) => {
  const cssUrls = getCssUrls(server);
  return cssUrls.map((url) => ({
    tag: 'link',
    attrs: { rel: 'stylesheet', href: server.config.base + url.slice(1) },
  }));
};

/**
 * Live-reload route CSS that Qwik injects as `<link>` tags; it only lives in the SSR graph, so Vite
 * skips HMR. Emit a `css-update` to swap the `<link>` in place. Returns `true` when handled.
 */
export const sendRouterCssHotUpdate = (
  server: ViteDevServer,
  file: string,
  timestamp: number
): boolean => {
  const { client, ssr } = server.environments;
  if (!isCssPath(file) || client.moduleGraph.getModulesByFile(file)?.size) {
    return false;
  }
  const paths = new Set<string>();
  for (const mod of ssr.moduleGraph.getModulesByFile(file) ?? []) {
    mod.lastHMRTimestamp = timestamp; // keep getCssUrls' cache-busting query fresh on full reloads
    paths.add(mod.url.split('?')[0]);
  }
  if (!paths.size) {
    return false;
  }
  client.hot.send({
    type: 'update',
    updates: [...paths].map((path) => ({
      type: 'css-update' as const,
      path,
      acceptedPath: path,
      timestamp,
    })),
  });
  return true;
};
