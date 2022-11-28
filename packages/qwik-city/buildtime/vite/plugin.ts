import { createMdxTransformer, MdxTransform } from '../markdown/mdx';
import { basename, join, resolve } from 'node:path';
import type { Plugin, UserConfig } from 'vite';
import { generateQwikCityPlan } from '../runtime-generation/generate-qwik-city-plan';
import type { BuildContext } from '../types';
import { createBuildContext, resetBuildContext } from '../context';
import {
  getExtension,
  isMarkdownExt,
  isMenuFileName,
  normalizePath,
  removeExtension,
} from '../../utils/fs';
import { validatePlugin } from './validate-plugin';
import type { QwikCityPluginApi, QwikCityVitePluginOptions } from './types';
import { build } from '../build';
import { dev404Middleware, ssrDevMiddleware, staticDistMiddleware } from './dev-server';
import { transformMenu } from '../markdown/menu';
import { generateQwikCityEntries } from '../runtime-generation/generate-entries';
import { patchGlobalFetch } from '../../middleware/node/node-fetch';
import type { QwikManifest } from '@builder.io/qwik/optimizer';
import fs from 'node:fs';
import {
  generateServiceWorkerRegister,
  prependManifestToServiceWorker,
} from '../runtime-generation/generate-service-worker';
import type { RollupError } from 'rollup';
import type { QwikVitePlugin } from '../../../qwik/src/optimizer/src';
import {
  NOT_FOUND_PATHS_ID,
  RESOLVED_NOT_FOUND_PATHS_ID,
  RESOLVED_STATIC_PATHS_ID,
  STATIC_PATHS_ID,
} from '../../adaptors/shared/vite';
import { postBuild } from '../../adaptors/shared/vite/post-build';

/**
 * @alpha
 */
export function qwikCity(userOpts?: QwikCityVitePluginOptions): any {
  patchGlobalFetch();

  let ctx: BuildContext | null = null;
  let mdxTransform: MdxTransform | null = null;
  let rootDir: string | null = null;
  let qwikPlugin: QwikVitePlugin | null;
  let ssrFormat = 'esm';
  let outDir: string | null = null;

  const api: QwikCityPluginApi = {
    getBasePathname: () => ctx?.opts.basePathname ?? '/',
    getRoutes: () => {
      return ctx?.routes.slice() ?? [];
    },
    getServiceWorkers: () => {
      return ctx?.serviceWorkers.slice() ?? [];
    },
  };

  const plugin: Plugin = {
    name: 'vite-plugin-qwik-city',
    enforce: 'pre',
    api,

    config() {
      const updatedViteConfig: UserConfig = {
        appType: 'custom',
        base: userOpts?.basePathname,
        optimizeDeps: {
          exclude: [QWIK_CITY, QWIK_CITY_PLAN_ID, QWIK_CITY_ENTRIES_ID, QWIK_CITY_SW_REGISTER],
        },
        ssr: {
          noExternal: [QWIK_CITY, QWIK_CITY_PLAN_ID, QWIK_CITY_ENTRIES_ID, QWIK_CITY_SW_REGISTER],
        },
      };
      return updatedViteConfig;
    },

    async configResolved(config) {
      rootDir = resolve(config.root);

      const target = config.build?.ssr || config.mode === 'ssr' ? 'ssr' : 'client';

      ctx = createBuildContext(rootDir!, userOpts, target);

      ctx.isDevServer = config.command === 'serve';
      ctx.isDevServerClientOnly = ctx.isDevServer && config.mode !== 'ssr';

      await validatePlugin(ctx.opts);

      mdxTransform = await createMdxTransformer(ctx);

      qwikPlugin = config.plugins.find((p) => p.name === 'vite-plugin-qwik') as QwikVitePlugin;
      if (!qwikPlugin) {
        throw new Error('Missing vite-plugin-qwik');
      }

      if (config.ssr?.format === 'cjs') {
        ssrFormat = 'cjs';
      }
      outDir = config.build?.outDir;
    },

    configureServer(server) {
      if (ctx) {
        // handles static files physically found in the dist directory
        server.middlewares.use(staticDistMiddleware(server));

        // qwik city middleware injected BEFORE vite internal middlewares
        // and BEFORE @builder.io/qwik/optimizer/vite middlewares
        // handles only known user defined routes
        server.middlewares.use(ssrDevMiddleware(ctx, server));
      }

      return () => {
        // qwik city 404 middleware injected AFTER vite internal middlewares
        // and no other middlewares have handled this request
        server.middlewares.use(dev404Middleware());
      };
    },

    buildStart() {
      resetBuildContext(ctx);
    },

    resolveId(id) {
      if (id === QWIK_CITY_PLAN_ID || id === QWIK_CITY_ENTRIES_ID || id === QWIK_CITY_SW_REGISTER) {
        return join(rootDir!, id);
      }
      if (id === STATIC_PATHS_ID) {
        return {
          id: './' + RESOLVED_STATIC_PATHS_ID,
          external: true,
        };
      }
      if (id === NOT_FOUND_PATHS_ID) {
        return {
          id: './' + RESOLVED_NOT_FOUND_PATHS_ID,
          external: true,
        };
      }
      return null;
    },

    async load(id) {
      if (ctx) {
        if (id.endsWith(QWIK_CITY_ENTRIES_ID)) {
          // @qwik-city-entries
          return generateQwikCityEntries(ctx);
        }

        const isCityPlan = id.endsWith(QWIK_CITY_PLAN_ID);
        const isSwRegister = id.endsWith(QWIK_CITY_SW_REGISTER);

        if (isCityPlan || isSwRegister) {
          if (!ctx.isDevServer && ctx.isDirty) {
            await build(ctx);
            ctx.isDirty = false;
            ctx.diagnostics.forEach((d) => {
              this.warn(d.message);
            });
          }

          if (isCityPlan) {
            // @qwik-city-plan
            return generateQwikCityPlan(ctx, qwikPlugin!);
          }

          if (isSwRegister) {
            // @qwik-city-sw-register
            return generateServiceWorkerRegister(ctx);
          }
        }
      }
      return null;
    },

    async transform(code, id) {
      if (ctx) {
        const fileName = basename(id);
        if (isMenuFileName(fileName)) {
          const menuCode = await transformMenu(ctx.opts, id, code);
          return menuCode;
        }

        const ext = getExtension(fileName);
        if (isMarkdownExt(ext) && mdxTransform) {
          try {
            const mdxResult = await mdxTransform(code, id);
            return mdxResult;
          } catch (e: any) {
            const column = e.position.start.column;
            const line = e.position.start.line;
            const err: RollupError = Object.assign(new Error(e.reason), {
              id,
              plugin: 'qwik-city-mdx',
              loc: {
                column: column,
                line: line,
              },
              stack: '',
            });
            this.error(err);
          }
        }
      }

      return null;
    },

    generateBundle(_, bundles) {
      // client bundles
      if (ctx?.target === 'client') {
        const entries = [...ctx.entries, ...ctx.serviceWorkers].map((entry) => {
          return {
            chunkFileName: entry.chunkFileName,
            extensionlessFilePath: removeExtension(entry.filePath),
          };
        });

        for (const entry of entries) {
          for (const fileName in bundles) {
            const c = bundles[fileName];
            if (c.type === 'chunk' && c.isDynamicEntry && c.facadeModuleId) {
              const extensionlessFilePath = removeExtension(normalizePath(c.facadeModuleId));
              if (entry.extensionlessFilePath === extensionlessFilePath) {
                c.fileName = entry.chunkFileName;
                continue;
              }
            }
          }
        }
      }
    },

    closeBundle: {
      sequential: true,
      async handler() {
        if (ctx?.target === 'ssr') {
          // ssr build
          // TODO: Remove globalThis that was previously used. Left in for backwards compatibility.
          const manifest: QwikManifest =
            (globalThis as any).QWIK_MANIFEST || qwikPlugin!.api.getManifest();
          const clientOutDir: string =
            (globalThis as any).QWIK_CLIENT_OUT_DIR || qwikPlugin!.api.getClientOutDir();

          if (manifest && clientOutDir) {
            for (const swEntry of ctx.serviceWorkers) {
              try {
                const swClientDistPath = join(clientOutDir, swEntry.chunkFileName);
                const swCode = await fs.promises.readFile(swClientDistPath, 'utf-8');
                try {
                  const swCodeUpdate = prependManifestToServiceWorker(ctx, manifest, swCode);
                  if (swCodeUpdate) {
                    await fs.promises.mkdir(clientOutDir, { recursive: true });
                    await fs.promises.writeFile(swClientDistPath, swCodeUpdate);
                  }
                } catch (e2) {
                  console.error(e2);
                }
              } catch (e) {
                // safe to ignore if a service-worker.js not found
              }
            }
          }

          const { staticPathsCode, notFoundPathsCode } = await postBuild(
            clientOutDir,
            api.getBasePathname(),
            [],
            ssrFormat,
            false
          );

          if (outDir) {
            await fs.promises.mkdir(outDir, { recursive: true });

            // create server package.json to ensure mjs is used
            const serverPackageJsonPath = join(outDir, 'package.json');
            const serverPackageJsonCode = `{"type":"module"}`;

            await Promise.all([
              fs.promises.writeFile(join(outDir, RESOLVED_STATIC_PATHS_ID), staticPathsCode),
              fs.promises.writeFile(join(outDir, RESOLVED_NOT_FOUND_PATHS_ID), notFoundPathsCode),
              fs.promises.writeFile(serverPackageJsonPath, serverPackageJsonCode),
            ]);
          }
        }
      },
    },
  };

  return plugin;
}

const QWIK_CITY_PLAN_ID = '@qwik-city-plan';
const QWIK_CITY_ENTRIES_ID = '@qwik-city-entries';
const QWIK_CITY = '@builder.io/qwik-city';
const QWIK_CITY_SW_REGISTER = '@qwik-city-sw-register';
