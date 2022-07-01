import { createMdxTransformer, MdxTransform } from '../markdown/mdx';
import { basename, join, resolve } from 'path';
import type { Plugin, UserConfig } from 'vite';
import { generateQwikCityPlan } from '../runtime-generation/generate-runtime';
import type { BuildContext } from '../types';
import { createBuildContext, resetBuildContext } from '../utils/context';
import { isMarkdownFileName } from '../utils/fs';
import { validatePlugin } from './validate-plugin';
import type { QwikCityVitePluginOptions } from './types';
import { endpointHandler } from '../../middleware/request-handler/endpoint-handler';
import { getRouteParams } from '../../runtime/src/library/routing';
import { build } from '../build';
import { isMenuFileName } from '../markdown/menu';
import type { RequestEvent } from '../../runtime/src/library/types';
import { checkRedirect } from '../../middleware/request-handler/redirect-handler';

/**
 * @alpha
 */
export function qwikCity(userOpts?: QwikCityVitePluginOptions) {
  let ctx: BuildContext | null = null;
  let mdxTransform: MdxTransform | null = null;
  let rootDir: string | null = null;

  const plugin: Plugin = {
    name: 'vite-plugin-qwik-city',

    enforce: 'pre',

    config() {
      const updatedViteConfig: UserConfig = {
        optimizeDeps: {
          exclude: [QWIK_CITY_PLAN_ID],
        },
      };
      return updatedViteConfig;
    },

    async configResolved(config) {
      rootDir = resolve(config.root);

      const target = config.build?.ssr || config.mode === 'ssr' ? 'ssr' : 'client';

      ctx = createBuildContext(rootDir!, userOpts, target);

      await validatePlugin(ctx.opts);

      mdxTransform = await createMdxTransformer(ctx);
    },

    configureServer(server) {
      if (ctx) {
        const routesDirWatcher = server.watcher.add(ctx.opts.routesDir);
        routesDirWatcher.on('all', (ev, path) => {
          if (ev === 'add' || ev === 'addDir' || ev === 'unlink' || ev === 'unlinkDir') {
            server.restart();
          } else if (ev === 'change') {
            const fileName = basename(path);
            if (isMenuFileName(fileName)) {
              server.restart();
            }
          }
        });
      }

      server.middlewares.use(async (req, res, next) => {
        try {
          if (ctx) {
            if (ctx.dirty) {
              await build(ctx);
            }

            const url = new URL(req.originalUrl!, `http://${req.headers.host}`);
            const pathname = url.pathname;

            for (const route of ctx.routes) {
              const match = route.pattern.exec(pathname);
              if (match) {
                if (route.type === 'endpoint') {
                  const params = getRouteParams(route.paramNames, match);
                  const request = new Request(url.href, { method: req.method });
                  const requestEv: RequestEvent = {
                    method: request.method,
                    request,
                    params,
                    url,
                  };

                  const endpointModule = await server.ssrLoadModule(route.filePath);
                  const response = await endpointHandler(requestEv, endpointModule);

                  res.statusCode = response.status;
                  res.statusMessage = response.statusText;
                  response.headers.forEach((value, key) => res.setHeader(key, value));
                  res.write(response.body);
                  res.end();
                  return;
                }

                const redirectResponse = checkRedirect(url, ctx.opts.trailingSlash);
                if (redirectResponse) {
                  res.statusCode = redirectResponse.status;
                  redirectResponse.headers.forEach((value, key) => res.setHeader(key, value));
                  res.end();
                  return;
                }
              }
            }
          }

          next();
        } catch (e) {
          next(e);
        }
      });
    },

    buildStart() {
      resetBuildContext(ctx);
    },

    resolveId(id) {
      if (id === QWIK_CITY_PLAN_ID) {
        return join(rootDir!, QWIK_CITY_PLAN_ID);
      }
      return null;
    },

    async load(id) {
      if (id.endsWith(QWIK_CITY_PLAN_ID) && ctx) {
        // @qwik-city-plan
        await build(ctx);
        ctx.diagnostics.forEach((d) => {
          this.warn(d.message);
        });
        return generateQwikCityPlan(ctx);
      }
      return null;
    },

    async transform(code, id) {
      if (isMarkdownFileName(id) && mdxTransform) {
        const mdxResult = await mdxTransform(code, id);
        return mdxResult;
      }
      return null;
    },
  };

  return plugin as any;
}

const QWIK_CITY_PLAN_ID = '@qwik-city-plan';
