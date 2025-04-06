import type { QwikVitePlugin } from '@builder.io/qwik/optimizer';
import swRegister from '@qwik-city-sw-register-build';
import fs from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import type { Plugin, PluginOption, Rollup, UserConfig } from 'vite';
import { loadEnv } from 'vite';
import {
  NOT_FOUND_PATHS_ID,
  RESOLVED_NOT_FOUND_PATHS_ID,
  RESOLVED_STATIC_PATHS_ID,
  STATIC_PATHS_ID,
} from '../../adapters/shared/vite';
import { postBuild } from '../../adapters/shared/vite/post-build';
import { patchGlobalThis } from '../../middleware/node/node-fetch';
import { isMenuFileName, normalizePath, removeExtension } from '../../utils/fs';
import { build } from '../build';
import { createBuildContext, resetBuildContext } from '../context';
import { createMdxTransformer, type MdxTransform } from '../markdown/mdx';
import { transformMenu } from '../markdown/menu';
import { generateQwikCityEntries } from '../runtime-generation/generate-entries';
import { generateQwikCityPlan } from '../runtime-generation/generate-qwik-city-plan';
import { generateServiceWorkerRegister } from '../runtime-generation/generate-service-worker';
import type { BuildContext } from '../types';
import { ssrDevMiddleware, staticDistMiddleware } from './dev-server';
import { getRouteImports } from './get-route-imports';
import { imagePlugin } from './image-jsx';
import type { QwikCityPluginApi, QwikCityVitePluginOptions } from './types';
import { validatePlugin } from './validate-plugin';

/** @public */
export function qwikCity(userOpts?: QwikCityVitePluginOptions): PluginOption[] {
  return [qwikCityPlugin(userOpts), ...imagePlugin(userOpts)];
}

function qwikCityPlugin(userOpts?: QwikCityVitePluginOptions): any {
  let ctx: BuildContext | null = null;
  let mdxTransform: MdxTransform | null = null;
  let rootDir: string | null = null;
  let qwikPlugin: QwikVitePlugin | null;
  let ssrFormat: 'esm' | 'cjs' = 'esm';
  let outDir: string | null = null;

  // Patch Stream APIs
  patchGlobalThis();

  globalThis.__qwikCityNew = true;

  const api: QwikCityPluginApi = {
    getBasePathname: () => ctx?.opts.basePathname ?? '/',
    getRoutes: () => {
      return ctx?.routes.slice() ?? [];
    },
    getServiceWorkers: () => {
      return ctx?.serviceWorkers.slice() ?? [];
    },
  };

  type P<T> = Plugin<T> & { api: T };

  const plugin: P<QwikCityPluginApi> = {
    name: 'vite-plugin-qwik-city',
    enforce: 'pre',
    api,

    async config() {
      const updatedViteConfig: UserConfig = {
        appType: 'custom',
        optimizeDeps: {
          exclude: [QWIK_CITY, QWIK_CITY_PLAN_ID, QWIK_CITY_ENTRIES_ID, QWIK_CITY_SW_REGISTER],
        },
        ssr: {
          external: ['node:async_hooks'],
          noExternal: [QWIK_CITY, QWIK_CITY_PLAN_ID, QWIK_CITY_ENTRIES_ID, QWIK_CITY_SW_REGISTER],
        },
      };
      return updatedViteConfig;
    },

    async configResolved(config) {
      Object.assign(process.env, loadEnv(config.mode, process.cwd(), ''));
      rootDir = resolve(config.root);

      const target = config.build?.ssr || config.mode === 'ssr' ? 'ssr' : 'client';

      ctx = createBuildContext(rootDir!, config.base, userOpts, target);

      ctx.isDevServer = config.command === 'serve' && config.mode !== 'production';
      ctx.isDevServerClientOnly = ctx.isDevServer && config.mode !== 'ssr';

      await validatePlugin(ctx.opts);

      mdxTransform = await createMdxTransformer(ctx);

      qwikPlugin = config.plugins.find((p) => p.name === 'vite-plugin-qwik') as QwikVitePlugin;
      if (!qwikPlugin) {
        throw new Error('Missing vite-plugin-qwik');
      }
      qwikPlugin.api.registerBundleGraphAdder?.((manifest) => {
        return getRouteImports(ctx!.routes, manifest);
      });

      // @ts-ignore `format` removed in Vite 5
      if (config.ssr?.format === 'cjs') {
        ssrFormat = 'cjs';
      }
      outDir = config.build?.outDir;
    },

    configureServer(server) {
      return () => {
        if (!ctx) {
          throw new Error('configureServer: Missing ctx from configResolved');
        }
        if (!ctx.isDevServer) {
          // preview server: serve static files from the dist directory
          server.middlewares.use(staticDistMiddleware(server));
        }
        // qwik city middleware injected BEFORE vite internal middlewares
        // and BEFORE @builder.io/qwik/optimizer/vite middlewares
        // handles only known user defined routes
        server.middlewares.use(ssrDevMiddleware(ctx, server));
      };
    },

    buildStart() {
      resetBuildContext(ctx);
    },

    resolveId(id) {
      if (id === QWIK_SERIALIZER) {
        return join(rootDir!, id);
      }
      if (id === QWIK_CITY_PLAN_ID || id === QWIK_CITY_ENTRIES_ID) {
        return {
          id: join(rootDir!, id),
          // user entries added in the routes, like src/routes/service-worker.ts
          // are added as dynamic imports to the qwik-city-plan as a way to create
          // a new entry point for the build. Ensure these are not treeshaked.
          moduleSideEffects: 'no-treeshake',
        };
      }
      if (id === QWIK_CITY_SW_REGISTER) {
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

    async load(id, opts) {
      if (ctx) {
        if (id.endsWith(QWIK_CITY_ENTRIES_ID)) {
          // @qwik-city-entries
          return generateQwikCityEntries(ctx);
        }
        const isSerializer = id.endsWith(QWIK_SERIALIZER);
        const isCityPlan = id.endsWith(QWIK_CITY_PLAN_ID);
        const isSwRegister = id.endsWith(QWIK_CITY_SW_REGISTER);

        if (isSerializer) {
          return `export {_deserializeData, _serializeData, _verifySerializable} from '@builder.io/qwik'`;
        }
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
            return generateQwikCityPlan(ctx, qwikPlugin!, opts?.ssr ?? false);
          }

          if (isSwRegister) {
            // @qwik-city-sw-register
            return generateServiceWorkerRegister(ctx, swRegister);
          }
        }
      }
      return null;
    },

    async transform(code, id) {
      if (id.startsWith('\0')) {
        return;
      }
      const ext = extname(id).toLowerCase();
      const isMD = ext === '.md' || ext === '.mdx';
      if (ctx && isMD) {
        const fileName = basename(id);
        if (isMenuFileName(fileName)) {
          const menuCode = await transformMenu(ctx.opts, id, code);
          return { code: menuCode, map: null };
        }
        if (mdxTransform) {
          try {
            const mdxResult = await mdxTransform(code, id);
            return mdxResult;
          } catch (e: any) {
            if (e && typeof e == 'object' && 'position' in e && 'reason' in e) {
              const column = (e as any).position?.start.column;
              const line = (e as any).position?.start.line;
              const err: Rollup.RollupError = Object.assign(new Error(e.reason), {
                id,
                plugin: 'qwik-city-mdx',
                loc: {
                  column: column,
                  line: line,
                },
                stack: '',
              });
              this.error(err);
            } else if (e instanceof Error) {
              this.error(e);
            } else {
              this.error(String(e));
            }
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
        if (ctx?.target === 'ssr' && !ctx?.isDevServer) {
          // ssr build
          const clientOutDir = qwikPlugin!.api.getClientOutDir();

          if (outDir && clientOutDir) {
            const assetsDir = qwikPlugin!.api.getAssetsDir();
            const { staticPathsCode, notFoundPathsCode } = await postBuild(
              clientOutDir,
              assetsDir ? join(api.getBasePathname(), assetsDir) : api.getBasePathname(),
              [],
              ssrFormat,
              false
            );

            await fs.promises.mkdir(outDir, { recursive: true });
            const serverPackageJsonPath = join(outDir, 'package.json');

            let packageJson = {};

            // we want to keep the content of an existing file:
            if (fs.existsSync(serverPackageJsonPath)) {
              const content = await fs.promises.readFile(serverPackageJsonPath, 'utf-8');
              const contentAsJson = JSON.parse(content);
              packageJson = {
                ...contentAsJson,
              };
            }

            const ssrFormat2pkgTypeMap = {
              cjs: 'commonjs',
              esm: 'module',
            };
            packageJson = { ...packageJson, type: ssrFormat2pkgTypeMap[ssrFormat] || 'module' };
            const serverPackageJsonCode = JSON.stringify(packageJson, null, 2);

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

const QWIK_SERIALIZER = '@qwik-serializer';
export const QWIK_CITY_PLAN_ID = '@qwik-city-plan';
const QWIK_CITY_ENTRIES_ID = '@qwik-city-entries';
const QWIK_CITY = '@builder.io/qwik-city';
const QWIK_CITY_SW_REGISTER = '@qwik-city-sw-register';
