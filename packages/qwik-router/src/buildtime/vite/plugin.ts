import swRegister from '@qwik-router-sw-register-build';
import type { QwikVitePlugin } from '@qwik.dev/core/optimizer';
import fs from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import type { Plugin, PluginOption, Rollup, UserConfig, ViteDevServer } from 'vite';
import { loadEnv } from 'vite';
import { isMenuFileName, normalizePath, removeExtension } from '../../utils/fs';
import { build } from '../build';
import { createBuildContext, resetBuildContext } from '../context';
import { createMdxTransformer, type MdxTransform } from '../markdown/mdx';
import { transformMenu } from '../markdown/menu';
import { generateQwikRouterEntries } from '../runtime-generation/generate-entries';
import { generateQwikRouterConfig } from '../runtime-generation/generate-qwik-router-config';
import { generateServiceWorkerRegister } from '../runtime-generation/generate-service-worker';
import type { BuildContext } from '../types';
import { getRouteImports } from './get-route-imports';
import { imagePlugin } from './image-jsx';
import type {
  QwikCityVitePluginOptions,
  QwikRouterPluginApi,
  QwikRouterVitePluginOptions,
} from './types';
import { validatePlugin } from './validate-plugin';
import { getRouterIndexTags, makeRouterDevMiddleware } from './dev-middleware';

export const QWIK_ROUTER_CONFIG_ID = '@qwik-router-config';
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
  let viteCommand: string;
  let devServer: ViteDevServer | null = null;

  let devSsrServer = userOpts?.devSsrServer;

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

    async config(_viteConfig, viteEnv) {
      viteCommand = viteEnv.command;
      const updatedViteConfig: UserConfig = {
        define: {
          'globalThis.__DEFAULT_LOADERS_SERIALIZATION_STRATEGY__': JSON.stringify(
            userOpts?.defaultLoadersSerializationStrategy || 'never'
          ),
          'globalThis.__NO_TRAILING_SLASH__': JSON.stringify(userOpts?.trailingSlash === false),
        },
        appType: 'custom',
        resolve: {
          alias: [
            { find: '@builder.io/qwik-city', replacement: '@qwik.dev/router' },
            { find: /^@builder\.io\/qwik-city\/(.*)/, replacement: '@qwik.dev/router/$1' },
            { find: '@qwik-city-plan', replacement: QWIK_ROUTER_CONFIG_ID },
            { find: '@qwik-city-entries', replacement: QWIK_ROUTER_ENTRIES_ID },
            { find: '@qwik-city-sw-register', replacement: QWIK_ROUTER_SW_REGISTER },
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
            QWIK_ROUTER,
            QWIK_ROUTER_CONFIG_ID,
            QWIK_ROUTER_ENTRIES_ID,
            QWIK_ROUTER_SW_REGISTER,
          ],
        },
        server: {
          watch: {
            // needed for recursive watching of index and layout files in the src/routes directory
            disableGlobbing: false,
          },
        },
      };
      return updatedViteConfig;
    },

    async configResolved(config) {
      Object.assign(process.env, loadEnv(config.mode, process.cwd(), ''));
      rootDir = resolve(config.root);

      const target = config.build?.ssr || config.mode === 'ssr' ? 'ssr' : 'client';

      ctx = createBuildContext(
        rootDir!,
        config.base,
        userOpts,
        target,
        !userOpts?.staticImportRoutes
      );

      await validatePlugin(ctx.opts);

      mdxTransform = await createMdxTransformer(ctx);

      qwikPlugin = config.plugins.find((p) => p.name === 'vite-plugin-qwik') as QwikVitePlugin;
      if (!qwikPlugin) {
        throw new Error('Missing vite-plugin-qwik');
      }
      if (typeof devSsrServer !== 'boolean') {
        // read the old option from qwik plugin
        devSsrServer = qwikPlugin.api._oldDevSsrServer();
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

    async configureServer(server) {
      devServer = server;
      // recursively watch all route files in the src/routes directory
      const toWatch = resolve(
        rootDir!,
        'src/routes/**/{index,layout,entry,service-worker}{.,@,-}*'
      );
      server.watcher.add(toWatch);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      server.watcher.on('change', (path) => {
        // If the path is not an index or layout file, skip
        if (!/\/(index[.@]|layout[.-]|entry\.|service-worker\.)[^/]*$/.test(path)) {
          return;
        }
        // Invalidate the router config
        ctx!.isDirty = true;
        const graph = server.environments?.ssr?.moduleGraph;
        if (graph) {
          const mod = graph.getModuleById('@qwik-router-config');
          if (mod) {
            graph.invalidateModule(mod);
          }
        }
      });

      if (userOpts?.devSsrServer !== false) {
        // this callback runs after all other middlewares have been added, so we can SSR as the last middleware
        return () => {
          server.middlewares.use(makeRouterDevMiddleware(server, ctx!));
        };
      }
    },

    transformIndexHtml() {
      if (viteCommand !== 'serve') {
        return;
      }
      return getRouterIndexTags(devServer!);
    },

    buildStart() {
      resetBuildContext(ctx);
    },

    resolveId(id) {
      if (id === QWIK_ROUTER_CONFIG_ID || id === QWIK_ROUTER_ENTRIES_ID) {
        return {
          id,
          // user entries added in the routes, like src/routes/service-worker.ts
          // are added as dynamic imports to the qwik-router-config as a way to create
          // a new entry point for the build. Ensure these are not treeshaken.
          moduleSideEffects: 'no-treeshake',
        };
      }
      if (id === QWIK_ROUTER_SW_REGISTER) {
        return id;
      }
      return null;
    },

    async load(id, opts) {
      if (ctx) {
        if (id.endsWith(QWIK_ROUTER_ENTRIES_ID)) {
          // @qwik-router-entries
          return generateQwikRouterEntries(ctx);
        }
        const isRouterConfig = id.endsWith(QWIK_ROUTER_CONFIG_ID);
        const isSwRegister = id.endsWith(QWIK_ROUTER_SW_REGISTER);
        if (isRouterConfig || isSwRegister) {
          if (ctx.isDirty) {
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
      // Turn entry and service worker chunks into entry points
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
        if (ctx?.target === 'ssr' && outDir) {
          await generateServerPackageJson(outDir, ssrFormat);
        }
      },
    },
  };

  return plugin;
}

async function generateServerPackageJson(outDir: string, ssrFormat: 'esm' | 'cjs') {
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

  packageJson = {
    ...packageJson,
    type: ssrFormat == 'cjs' ? 'commonjs' : 'module',
  };
  const serverPackageJsonCode = JSON.stringify(packageJson, null, 2);

  await fs.promises.writeFile(serverPackageJsonPath, serverPackageJsonCode);
}
