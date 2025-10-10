import type { Render } from '@qwik.dev/core/server';
import type { RendererOptions } from '@qwik.dev/router';
import type { Connect, ModuleNode, ViteDevServer } from 'vite';
import { updateRoutingContext } from '../build';
import type { RoutingContext } from '../types';
import { formatError } from './format-error';
import { wrapResponseForHtmlTransform } from './html-transform-wrapper';

export const makeRouterDevMiddleware =
  (server: ViteDevServer, ctx: RoutingContext): Connect.NextHandleFunction =>
  async (req, res, next) => {
    // This middleware is the fallback for Vite dev mode; it renders the application

    // TODO more flexible entry points, like importing `render` from `src/server`
    // TODO pick a better name, entry.server-renderer perhaps?
    const mod = (await server.ssrLoadModule('src/entry.ssr')) as { default: Render };
    if (!mod.default) {
      console.error('No default export found in src/entry.ssr');
      return next();
    }
    const renderer = mod.default;
    if (ctx!.isDirty) {
      await updateRoutingContext(ctx!);
      ctx!.isDirty = false;
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
      const { router, staticFile, notFound } = createQwikRouter({ render });

      // Wrap the response to enable HTML transformation
      const wrappedRes = wrapResponseForHtmlTransform(req, res, server);

      staticFile(req, wrappedRes, () => {
        router(req, wrappedRes, () => {
          notFound(req, wrappedRes, next);
        });
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

const CSS_EXTENSIONS = ['.css', '.scss', '.sass', '.less', '.styl', '.stylus'];
const JS_EXTENSIONS = /\.[mc]?[tj]sx?$/;
const isCssPath = (url: string) => CSS_EXTENSIONS.some((ext) => url.endsWith(ext));

/**
 * Qwik handles CSS imports itself, meaning vite doesn't get to see them, so we need to manually
 * inject the CSS URLs.
 */
const getCssUrls = (server: ViteDevServer) => {
  const cssModules = new Set<ModuleNode>();
  const cssImportedByCSS = new Set<string>();

  Array.from(server.moduleGraph.fileToModulesMap.entries()).forEach(([_name, modules]) => {
    modules.forEach((mod) => {
      const [pathId, query] = mod.url.split('?');

      if (!query && isCssPath(pathId)) {
        const isEntryCSS = mod.importers.size === 0;
        const hasCSSImporter = Array.from(mod.importers).some((importer) => {
          const importerPath = (importer as typeof mod).url || (importer as typeof mod).file;

          const isCSS = importerPath && isCssPath(importerPath);

          if (isCSS && mod.url) {
            cssImportedByCSS.add(mod.url);
          }

          return isCSS;
        });

        const hasJSImporter = Array.from(mod.importers).some((importer) => {
          const importerPath = (importer as typeof mod).url || (importer as typeof mod).file;
          return importerPath && JS_EXTENSIONS.test(importerPath);
        });

        if ((isEntryCSS || hasJSImporter) && !hasCSSImporter && !cssImportedByCSS.has(mod.url)) {
          cssModules.add(mod);
        }
      }
    });
  });
  return [...cssModules].map(
    ({ url, lastHMRTimestamp }) => `${url}${lastHMRTimestamp ? `?t=${lastHMRTimestamp}` : ''}`
  );
};

export const getRouterIndexTags = (server: ViteDevServer) => {
  const cssUrls = getCssUrls(server);
  return cssUrls.map((url) => ({
    tag: 'link',
    attrs: { rel: 'stylesheet', href: url },
  }));
};
