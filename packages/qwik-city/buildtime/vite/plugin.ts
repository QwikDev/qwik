import { createMdxTransformer, MdxTransform } from '../markdown/mdx';
import { basename, extname, join, resolve } from 'path';
import type { Plugin, UserConfig } from 'vite';
import { generateQwikCityPlan } from '../runtime-generation/generate-runtime';
import type { BuildContext } from '../types';
import { createBuildContext, resetBuildContext } from '../utils/context';
import { isMarkdownFileName, normalizePath } from '../utils/fs';
import { validatePlugin } from './validate-plugin';
import type { QwikCityVitePluginOptions } from './types';
import { endpointHandler } from '../../middleware/request-handler/endpoint-handler';
import { getRouteParams } from '../../runtime/src/library/routing';
import { build } from '../build';
import { isMenuFileName } from '../markdown/menu';
import type { HttpMethod } from '../../runtime/src/library/types';
import { checkRedirect } from '../../middleware/request-handler/redirect-handler';
import { isAcceptJsonOnly } from '../../middleware/request-handler/utils';
import {
  createPrinter,
  createSourceFile,
  factory,
  isIdentifier,
  isVariableDeclaration,
  isVariableStatement,
  NewLineKind,
  ScriptTarget,
  SyntaxKind,
} from 'typescript';

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
                const method: HttpMethod = req.method as any;
                const request = new Request(url.href, { method, headers: req.headers as any });

                if (route.type === 'endpoint' || isAcceptJsonOnly(request)) {
                  const params = getRouteParams(route.paramNames, match);

                  const endpointModule = await server.ssrLoadModule(route.filePath);
                  const response = await endpointHandler(
                    request,
                    method,
                    url,
                    params,
                    endpointModule
                  );

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

      if (ctx && ctx.target === 'client') {
        const ext = extname(id);
        if (ext === '.js' && !id.includes('_layout')) {
          id = normalizePath(id);
          if (id.startsWith(ctx.opts.routesDir)) {
            if (SERVER_FNS.some((fnName) => code.includes(fnName))) {
              const modifiedCode = removeServerFns(code, id);
              if (modifiedCode) {
                return modifiedCode;
              }
            }
          }
        }
      }

      return null;
    },
  };

  return plugin as any;
}

function removeServerFns(code: string, id: string) {
  let didModify = false;
  const sourceFile = createSourceFile(id, code, ScriptTarget.Latest);

  for (const s of sourceFile.statements) {
    if (!isVariableStatement(s)) {
      continue;
    }

    if (!s.modifiers?.some((m) => m.kind === SyntaxKind.ExportKeyword)) {
      continue;
    }

    const decs = s.declarationList.declarations;

    for (const d of decs) {
      if (!isVariableDeclaration(d)) {
        continue;
      }
      const identifier = d.name;
      if (!isIdentifier(identifier)) {
        continue;
      }
      if (!SERVER_FNS.some((fn) => identifier.escapedText === fn)) {
        continue;
      }

      (d as any).initializer = factory.createNull();
      didModify = true;
    }
  }

  if (didModify) {
    const printer = createPrinter({ newLine: NewLineKind.LineFeed });
    return printer.printFile(sourceFile);
  }
  return null;
}

const QWIK_CITY_PLAN_ID = '@qwik-city-plan';

const SERVER_FNS = ['onGet', 'onPost', 'onRequest'];
