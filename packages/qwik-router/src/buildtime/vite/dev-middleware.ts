import type { Render } from '@qwik.dev/core/server';
import type { RendererOptions } from '@qwik.dev/router';
import { promises as fs } from 'node:fs';
import { preprocessCSS } from 'vite';
import type { Connect, HtmlTagDescriptor, ViteDevServer } from 'vite';
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

interface RouterCssModule {
  id: string;
  file: string;
  url: string;
}

const collectRouterCssModules = (server: ViteDevServer): RouterCssModule[] => {
  const clientGraph = server.environments.client.moduleGraph;
  const ssrGraph = server.environments.ssr.moduleGraph;
  const byFile = new Map<string, RouterCssModule>();

  for (const graph of [clientGraph, ssrGraph]) {
    for (const mod of graph.idToModuleMap.values()) {
      const [pathId, query] = mod.url.split('?');
      if (query || !isCssPath(pathId) || !mod.file || !mod.id) {
        continue;
      }
      const isEntryCSS = mod.importers.size === 0;
      let hasCSSImporter = false;
      let hasJSImporter = false;
      for (const importer of mod.importers) {
        const importerPath = importer.url || importer.file;
        if (!importerPath) {
          continue;
        }
        if (isCssPath(importerPath)) {
          hasCSSImporter = true;
        } else if (JS_EXTENSIONS.test(importerPath)) {
          hasJSImporter = true;
        }
      }
      if ((isEntryCSS || hasJSImporter) && !hasCSSImporter && !byFile.has(mod.file)) {
        byFile.set(mod.file, { id: mod.id, file: mod.file, url: mod.url });
      }
    }
  }
  return [...byFile.values()];
};

export const buildRouterCssTags = (
  cssModules: { id: string; url: string; css: string }[]
): HtmlTagDescriptor[] => {
  const tags: HtmlTagDescriptor[] = [];
  for (const { id, url, css } of cssModules) {
    if (css) {
      tags.push({
        tag: 'style',
        attrs: { 'data-vite-dev-id': id },
        children: css,
        injectTo: 'head',
      });
    } else {
      tags.push({ tag: 'link', attrs: { rel: 'stylesheet', href: url }, injectTo: 'head' });
    }
    tags.push({
      tag: 'script',
      attrs: { type: 'module' },
      children: `import ${JSON.stringify(url)}`,
      injectTo: 'head',
    });
  }
  return tags;
};

export const getRouterIndexTags = async (server: ViteDevServer): Promise<HtmlTagDescriptor[]> => {
  const cssModules = await Promise.all(
    collectRouterCssModules(server).map(async ({ id, file, url }) => {
      let css = '';
      try {
        const raw = await fs.readFile(file, 'utf-8');
        css = (await preprocessCSS(raw, file, server.config)).code;
      } catch {
        // no styles inlined; a <link> is emitted instead
      }
      return { id, url: server.config.base + url.slice(1), css };
    })
  );
  return buildRouterCssTags(cssModules);
};
