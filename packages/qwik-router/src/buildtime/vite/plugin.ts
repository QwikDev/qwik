import swRegister from '@qwik-router-sw-register-build';
import type { QwikVitePlugin } from '@qwik.dev/core/optimizer';
import fs from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import type { Plugin, PluginOption, Rollup, UserConfig } from 'vite';
import { BuildEnvironment, loadEnv } from 'vite';
import {
  NOT_FOUND_PATHS_ID,
  RESOLVED_NOT_FOUND_PATHS_ID,
  RESOLVED_STATIC_PATHS_ID,
  STATIC_PATHS_ID,
} from '../../adapters/shared/vite';
import { postBuild } from '../../adapters/shared/vite/post-build';
import { isMenuFileName, normalizePath, removeExtension } from '../../utils/fs';
import { build } from '../build';
import { createBuildContext, resetBuildContext } from '../context';
import { createMdxTransformer, type MdxTransform } from '../markdown/mdx';
import { transformMenu } from '../markdown/menu';
import { generateQwikRouterEntries } from '../runtime-generation/generate-entries';
import { generateQwikRouterConfig } from '../runtime-generation/generate-qwik-router-config';
import {
  generateServiceWorkerRegister,
  prependManifestToServiceWorker,
} from '../runtime-generation/generate-service-worker';
import type { BuildContext } from '../types';
import { ssrDevMiddleware } from './dev-server';
import { imagePlugin } from './image-jsx';
import { createRunnableDevEnvironment } from 'vite';
import type {
  QwikCityVitePluginOptions,
  QwikRouterPluginApi,
  QwikRouterVitePluginOptions,
} from './types';
import { validatePlugin } from './validate-plugin';

const QWIK_SERIALIZER = '@qwik-serializer';
const QWIK_ROUTER_CONFIG_ID = '@qwik-router-config';
const QWIK_ROUTER_ENTRIES_ID = '@qwik-router-entries';
const QWIK_ROUTER = '@qwik.dev/router';
const QWIK_ROUTER_SW_REGISTER = '@qwik-router-sw-register';

/**
 * @deprecated Use `qwikRouter` instead. Will be removed in V3
 * @public
 */
export function qwikCity(userOpts?: QwikCityVitePluginOptions): PluginOption[] {
  return qwikRouter(userOpts);
}

/** @public */
export function qwikRouter(userOpts?: QwikRouterVitePluginOptions): PluginOption[] {
  return [qwikRouterPlugin(userOpts), ...imagePlugin(userOpts)];
}

function qwikRouterPlugin(userOpts?: QwikRouterVitePluginOptions): any {
  let ctx: BuildContext | null = null;
  let mdxTransform: MdxTransform | null = null;
  let rootDir: string | null = null;
  let qwikPlugin: QwikVitePlugin | null;
  let ssrFormat: 'esm' | 'cjs' = 'esm';
  let outDir: string | null = null;

  globalThis.__qwikRouterNew = true;

  const api: QwikRouterPluginApi = {
    getBasePathname: () => ctx?.opts.basePathname ?? '/',
    getRoutes: () => {
      return ctx?.routes.slice() ?? [];
    },
    getServiceWorkers: () => {
      return ctx?.serviceWorkers.slice() ?? [];
    },
  };

  type P<T> = Plugin<T> & { api: T };

  const plugin: P<QwikRouterPluginApi> = {
    name: 'vite-plugin-qwik-router',
    enforce: 'pre',
    api,

    async config() {
      const updatedViteConfig: UserConfig = {
        appType: 'custom',
        resolve: {
          alias: [
            { find: '@builder.io/qwik-city', replacement: '@qwik.dev/router' },
            { find: /^@builder\.io\/qwik-city\/(.*)/, replacement: '@qwik.dev/router/$1' },
            { find: '@qwik-city-plan', replacement: QWIK_ROUTER_CONFIG_ID },
            { find: '@qwik-city-entries', replacement: QWIK_ROUTER_ENTRIES_ID },
            { find: '@qwik-city-sw-register', replacement: QWIK_ROUTER_SW_REGISTER },
            { find: '@qwik-city-not-found-paths', replacement: '@qwik-router-not-found-paths' },
            { find: '@qwik-city-static-paths', replacement: '@qwik-router-static-paths' },
          ],
        },
        optimizeDeps: {
          exclude: [
            QWIK_ROUTER,
            QWIK_ROUTER_CONFIG_ID,
            QWIK_ROUTER_ENTRIES_ID,
            QWIK_ROUTER_SW_REGISTER,
          ],
        },
        ssr: {
          external: ['node:async_hooks'],
          noExternal: [
            '@builder.io/qwik-city',
            '@qwik-city-plan',
            '@qwik-city-entries',
            '@qwik-city-sw-register',
            QWIK_ROUTER,
            QWIK_ROUTER_CONFIG_ID,
            QWIK_ROUTER_ENTRIES_ID,
            QWIK_ROUTER_SW_REGISTER,
          ],
        },
        environments: {
          node: {
            dev: {
              createEnvironment(name, config) {
                return createRunnableDevEnvironment(name, config);
              },
            },
            build: {
              createEnvironment(name, config) {
                return new BuildEnvironment(name, config);
              },
            },
          },
        },
      };
      return updatedViteConfig;
    },

    async configResolved(config) {
      Object.assign(process.env, loadEnv(config.mode, process.cwd(), ''));
      rootDir = resolve(config.root);

      const target = config.build?.ssr || config.mode === 'ssr' ? 'ssr' : 'client';

      ctx = createBuildContext(rootDir!, config.base, userOpts, target);

      ctx.isDevServer = false; // config.command === 'serve' && config.mode !== 'production';
      ctx.isDevServerClientOnly = false; // ctx.isDevServer && config.mode !== 'ssr';

      await validatePlugin(ctx.opts);

      mdxTransform = await createMdxTransformer(ctx);

      qwikPlugin = config.plugins.find((p) => p.name === 'vite-plugin-qwik') as QwikVitePlugin;
      if (!qwikPlugin) {
        throw new Error('Missing vite-plugin-qwik');
      }

      // @ts-ignore `format` removed in Vite 5
      if (config.ssr?.format === 'cjs') {
        ssrFormat = 'cjs';
      }
      outDir = config.build?.outDir;
    },

    configureServer: {
      order: 'post',
      handler(server) {
        return () => {
          if (!ctx) {
            throw new Error('configureServer: Missing ctx from configResolved');
          }
          // qwik router middleware injected BEFORE vite internal middlewares
          // and BEFORE @qwik.dev/core/optimizer/vite middlewares
          // handles only known user defined routes
          server.middlewares.use(ssrDevMiddleware(ctx, server));
        };
      },
    },

    buildStart() {
      resetBuildContext(ctx);
    },

    resolveId(id) {
      if (id === QWIK_SERIALIZER) {
        return join(rootDir!, id);
      }
      if (id === QWIK_ROUTER_CONFIG_ID || id === QWIK_ROUTER_ENTRIES_ID) {
        return {
          id: join(rootDir!, id),
          // user entries added in the routes, like src/routes/service-worker.ts
          // are added as dynamic imports to the qwik-router-config as a way to create
          // a new entry point for the build. Ensure these are not treeshaked.
          moduleSideEffects: 'no-treeshake',
        };
      }
      if (id === QWIK_ROUTER_SW_REGISTER) {
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
      console.log('load', id);
      if (ctx) {
        if (id.endsWith(QWIK_ROUTER_ENTRIES_ID)) {
          // @qwik-router-entries
          return generateQwikRouterEntries(ctx);
        }
        const isSerializer = id.endsWith(QWIK_SERIALIZER);
        const isRouterConfig = id.endsWith(QWIK_ROUTER_CONFIG_ID);
        const isSwRegister = id.endsWith(QWIK_ROUTER_SW_REGISTER);

        if (isSerializer) {
          return `export {_deserialize, _serialize, _verifySerializable} from '@qwik.dev/core'`;
        }
        if (isRouterConfig || isSwRegister) {
          if (ctx.isDirty) {
            console.log('building qc plan');
            await build(ctx);
            ctx.isDirty = false;
            ctx.diagnostics.forEach((d) => {
              this.warn(d.message);
            });
          }

          if (isRouterConfig) {
            // @qwik-router-config
            return generateQwikRouterConfig(ctx, qwikPlugin!, opts?.ssr ?? false);
          }

          if (isSwRegister) {
            // @qwik-router-sw-register
            return generateServiceWorkerRegister(ctx, swRegister);
          }
        }

        // TODO: we need to properly generate the value below and not just hardcoding it
        //       (note: this file is currently generated at build time here: packages/qwik-city/src/adapters/shared/vite/index.ts)
        if (id.endsWith(RESOLVED_NOT_FOUND_PATHS_ID)) {
          return `
            export function getNotFound(_pathname) {
              return 'Resource Not Found';
            }
          `;
        }

        // TODO: we need to properly generate the value below and not just hardcoding it
        //       (note: this file is currently generated at build time here: packages/qwik-city/src/adapters/shared/vite/index.ts)
        if (id.endsWith(RESOLVED_STATIC_PATHS_ID)) {
          return `
            export function isStaticPath(method, url) {
              if (method !== 'GET') {
                return false;
              }
              if (url.search !== '') {
                return false;
              }

              return /\\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url.pathname);
            }
          `;
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
                plugin: 'qwik-router-mdx',
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
          const manifest = qwikPlugin!.api.getManifest();
          const clientOutDir = qwikPlugin!.api.getClientOutDir();

          if (manifest && clientOutDir) {
            const basePathRelDir = api.getBasePathname().replace(/^\/|\/$/, '');
            const clientOutBaseDir = join(clientOutDir, basePathRelDir);
            const insightsManifest = await qwikPlugin!.api.getInsightsManifest(clientOutDir);

            for (const swEntry of ctx.serviceWorkers) {
              try {
                const swClientDistPath = join(clientOutBaseDir, swEntry.chunkFileName);
                const swCode = await fs.promises.readFile(swClientDistPath, 'utf-8');
                try {
                  const swCodeUpdate = prependManifestToServiceWorker(
                    ctx,
                    manifest,
                    insightsManifest?.prefetch || null,
                    swCode
                  );
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
