import type { Render } from '@qwik.dev/core/server';
import type { DocumentHeadValue, RendererOptions, RendererOutputOptions } from '@qwik.dev/router';
import type { Connect, ModuleNode, Plugin, ViteDevServer } from 'vite';
import type { BuildContext } from '../types';
import { formatError } from './format-error';
import { build } from '../build';

export const makeRouterDevMiddleware =
  (server: ViteDevServer, ctx: BuildContext): Connect.NextHandleFunction =>
  async (req, res, next) => {
    // TODO more flexible entry points, like importing `render` from `src/server`
    const mod = (await server.ssrLoadModule('src/entry.ssr')) as { default: Render };
    if (!mod.default) {
      console.error('No default export found in src/entry.ssr');
      return next();
    }
    const renderer = mod.default;
    if (ctx!.isDirty) {
      await build(ctx!);
      ctx!.isDirty = false;
    }

    // entry.ts files
    const entry = ctx!.entries.find((e) => req.url === `${server.config.base}${e.chunkFileName}`);
    if (entry) {
      const entryContents = await server.transformRequest(
        `/@fs${entry.filePath.startsWith('/') ? '' : '/'}${entry.filePath}`
      );

      if (entryContents) {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(entryContents.code);
      } else {
        next();
      }
      return;
    }
    // in dev mode, serve a placeholder service worker
    if (req.url === `${server.config.base}service-worker.js`) {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(
        `/* Qwik Router Dev Service Worker */` +
          `self.addEventListener('install', () => self.skipWaiting());` +
          `self.addEventListener('activate', (ev) => ev.waitUntil(self.clients.claim()));`
      );
      return;
    }

    const documentHead = {
      /**
       * Vite normally injects imported CSS files into the HTML, but we render our own HTML so we
       * need to add them manually.
       *
       * Note: It's possible that new CSS files are created during render, we can't find those here.
       * For now, we ignore this possibility, it would mean needing a callback at the end of the
       * render before the `<body>` is closed.
       */
      links: getCssUrls(server).map((url) => {
        return { rel: 'stylesheet', href: url };
      }),
      scripts: [
        // Vite normally injects this
        { type: 'module', src: '/@vite/client' },
      ],
    } satisfies DocumentHeadValue;

    // Grab tags from other plugins
    await getExtraHeadContent(server, documentHead);

    // Now we can stream the render
    const { createQwikRouter } = (await server.ssrLoadModule(
      '@qwik.dev/router/middleware/node'
    )) as typeof import('@qwik.dev/router/middleware/node');
    try {
      const render = (async (opts: RendererOptions) => {
        return await renderer({
          ...opts,
          serverData: { ...opts.serverData, documentHead },
        } as RendererOutputOptions as any);
      }) as Render;
      const { router, staticFile, notFound } = createQwikRouter({ render });
      staticFile(req, res, () => {
        router(req, res, () => {
          notFound(req, res, next);
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

function getCssUrls(server: ViteDevServer) {
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
}

async function getExtraHeadContent(server: ViteDevServer, documentHead: Record<string, unknown[]>) {
  const fakeHTML = '<!DOCTYPE html><html><head>HEAD</head><body>BODY</body></html>';
  for (const { name: pluginName, transformIndexHtml } of server.config.plugins) {
    const handler =
      transformIndexHtml && 'handler' in transformIndexHtml
        ? transformIndexHtml.handler
        : transformIndexHtml;
    if (typeof handler === 'function') {
      const result = await (handler.call({} as any, fakeHTML, {
        server,
        path: '/',
        filename: 'index.html',
        command: 'serve',
      }) as ReturnType<Extract<Plugin['transformIndexHtml'], Function>>);
      if (result) {
        if (typeof result === 'string' || ('html' in result && result.html)) {
          console.warn(
            `qwik-router: plugin ${pluginName} returned a string for transformIndexHtml, unsupported by qwik-router:`,
            result
          );
        } else {
          const tags = 'tags' in result ? result.tags : result;
          if (!Array.isArray(tags)) {
            console.warn(
              `qwik-router: plugin ${pluginName} returned a non-array for tags in transformIndexHtml:`,
              result
            );
          } else {
            // Note that we don't support the injectTo option
            for (const { tag, attrs, children } of tags) {
              if (!attrs && !children) {
                console.warn(
                  `qwik-router: plugin ${pluginName} returned a tag with no attrs in transformIndexHtml:`,
                  tag,
                  result
                );
                continue;
              }
              const collectionName =
                tag === 'link'
                  ? 'links'
                  : tag === 'script'
                    ? 'scripts'
                    : tag === 'style'
                      ? 'styles'
                      : tag === 'meta'
                        ? 'meta'
                        : null;
              if (collectionName) {
                if (children && typeof children !== 'string') {
                  console.warn(
                    `qwik-router: plugin ${pluginName} returned a tag with children that is not a string in transformIndexHtml:`,
                    tag,
                    result
                  );
                } else {
                  (documentHead[collectionName] ||= []).push(
                    children ? { ...attrs, dangerouslySetInnerHTML: children } : attrs
                  );
                }
              } else {
                console.warn(
                  `qwik-router: plugin ${pluginName} returned an unsupported tag in transformIndexHtml:`,
                  tag,
                  result
                );
              }
            }
          }
        }
      }
    }
  }
}
