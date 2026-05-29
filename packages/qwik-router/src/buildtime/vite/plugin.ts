import swRegister from '../runtime-generation/sw-register-build?compiled-string';
import type { QwikVitePlugin } from '@qwik.dev/core/optimizer';
import fs from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import type {
  ConfigEnv,
  EnvironmentOptions,
  Plugin,
  PluginOption,
  Rollup,
  UserConfig,
  ViteDevServer,
} from 'vite';
import { loadEnv } from 'vite';
import { isMenuFileName, normalizePath, removeExtension } from '../../utils/fs';
import { parseRoutesDir } from '../build';
import { createBuildContext, resetBuildContext } from '../context';
import { createMdxTransformer, type MdxTransform } from '../markdown/mdx';
import { transformMenu } from '../markdown/menu';
import { generateQwikRouterEntries } from '../runtime-generation/generate-entries';
import { generateQwikRouterConfig } from '../runtime-generation/generate-qwik-router-config';
import { generateServiceWorkerRegister } from '../runtime-generation/generate-service-worker';
import type { RoutingContext } from '../types';
import { getRouteImports } from './get-route-imports';
import { imagePlugin } from './image-jsx';
import { collectServerFnModuleIds } from './server-fns';
import type {
  QwikCityVitePluginOptions,
  QwikRouterPluginApi,
  QwikRouterVitePluginOptions,
} from './types';
import { validatePlugin } from './validate-plugin';
import { getRouterIndexTags, makeRouterDevMiddleware } from './dev-middleware';

export const QWIK_ROUTER_CONFIG_ID = '@qwik-router-config';
/**
 * This virtual module is used to generate dynamic entries for user route files, which are added as
 * dynamic imports to the qwik-router-config as a way to create new entry points for the build.
 */
const QWIK_ROUTER_ENTRIES_ID = '@qwik-router-entries';
const QWIK_ROUTER = '@qwik.dev/router';
const QWIK_ROUTER_SW_REGISTER = '@qwik-router-sw-register';
const VIRTUAL_SERVER_FNS = 'virtual:qwik-router-server-fns';
type BuildContextRef = { current: RoutingContext | null };

/**
 * @deprecated Use `qwikRouter` instead. Will be removed in V3
 * @public
 */
export function qwikCity(userOpts?: QwikCityVitePluginOptions): PluginOption[] {
  return qwikRouter(userOpts);
}

/** @public */
export function qwikRouter(userOpts?: QwikRouterVitePluginOptions): PluginOption[] {
  const buildContextRef: BuildContextRef = { current: null };
  return [
    qwikRouterPlugin(userOpts, buildContextRef),
    serverFnsPlugin(buildContextRef),
    ...imagePlugin(userOpts),
  ];
}

/** Replace or strip `_R: "__LOADERS:path1|path2__"` placeholders in a bundle chunk. */
function replaceLoaderPlaceholders(code: string, loadersByFile: Map<string, string[]>): string {
  // Replace `_R: "__LOADERS:path1|path2__"` with the actual hash array, or strip the whole
  // `_R: ...` entry when no routeLoader$ was found — that way the client-side routing code
  // never sees a stale placeholder string and spreads it character-by-character.
  return code.replace(/_R\s*:\s*"__LOADERS:([^"]+)__"\s*,?/g, (_match, paths: string) => {
    const filePaths = paths.split('|');
    const hashes: string[] = [];
    for (const filePath of filePaths) {
      const fileHashes = loadersByFile.get(filePath);
      if (fileHashes) {
        hashes.push(...fileHashes);
      }
    }
    if (hashes.length > 0) {
      return `_R: ${JSON.stringify(hashes)},`;
    }
    // Trailing commas inside object literals are legal, so removing a mid-object entry
    // (and the trailing comma it emitted with) leaves the surrounding trie literal valid.
    return '';
  });
}

function qwikRouterPlugin(
  userOpts: QwikRouterVitePluginOptions | undefined,
  buildContextRef: BuildContextRef
) {
  let ctx: RoutingContext | null = null;
  let mdxTransform: MdxTransform | null = null;
  let rootDir: string | null = null;
  let qwikPlugin: QwikVitePlugin | null;
  let outDir: string | null = null;
  let viteCommand: string;
  let devServer: ViteDevServer | null = null;

  let devSsrServer = userOpts?.devSsrServer;
  const routesDir = userOpts?.routesDir ?? 'src/routes';
  const serverPluginsDir = userOpts?.serverPluginsDir ?? routesDir;
  /** Map from source file path to array of routeLoader$ hashes found in that file */
  const loadersByFile = new Map<string, string[]>();

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
          'globalThis.__SSR_CACHE_SIZE__': JSON.stringify(
            viteEnv.command === 'serve' ? 0 : (userOpts?.ssrCacheSize ?? 50)
          ),
          'globalThis.__STRICT_LOADERS__': JSON.stringify(userOpts?.strictLoaders !== false),
        },
        appType: 'custom',
        resolve: {
          dedupe: [QWIK_ROUTER, '@builder.io/qwik-city'],
          alias: [
            { find: '@builder.io/qwik-city', replacement: '@qwik.dev/router' },
            { find: /^@builder\.io\/qwik-city\/(.*)/, replacement: '@qwik.dev/router/$1' },
            { find: '@qwik-city-plan', replacement: QWIK_ROUTER_CONFIG_ID },
            { find: '@qwik-city-entries', replacement: QWIK_ROUTER_ENTRIES_ID },
            { find: '@qwik-city-sw-register', replacement: QWIK_ROUTER_SW_REGISTER },
          ],
        },
        optimizeDeps: {
          // Let Vite find all app deps, these are not part of the static imports from `src/root`
          entries: [
            `${routesDir}/**/index*`,
            `${routesDir}/**/layout*`,
            `${serverPluginsDir}/plugin@*`,
          ],
          // These need processing by the optimizer during dev
          exclude: [
            QWIK_ROUTER,
            QWIK_ROUTER_CONFIG_ID,
            QWIK_ROUTER_ENTRIES_ID,
            QWIK_ROUTER_SW_REGISTER,
          ],
        },
        // Duplicated from configEnvironment to support legacy vite build --ssr compatibility
        ssr: {
          external: ['node:async_hooks'],
          noExternal: [
            QWIK_ROUTER,
            QWIK_ROUTER_CONFIG_ID,
            QWIK_ROUTER_ENTRIES_ID,
            QWIK_ROUTER_SW_REGISTER,
            // We've had reports of bundling issues with zod
            'zod',
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

    configEnvironment(name: string, _config: EnvironmentOptions, _env: ConfigEnv) {
      // Use environment name to distinguish server vs client — config.consumer is not yet set
      // at the time this hook is called.
      if (name === 'ssr') {
        return {
          resolve: {
            external: ['node:async_hooks'],
            noExternal: [
              QWIK_ROUTER,
              QWIK_ROUTER_CONFIG_ID,
              QWIK_ROUTER_ENTRIES_ID,
              QWIK_ROUTER_SW_REGISTER,
              'zod',
            ],
          },
        } satisfies EnvironmentOptions;
      }
      return {};
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
      buildContextRef.current = ctx;

      await validatePlugin(ctx.opts);

      mdxTransform = await createMdxTransformer(ctx);
      // Use double type assertion to avoid TS "Excessive stack depth comparing types" error
      // when comparing QwikVitePlugin with Plugin types
      qwikPlugin = config.plugins.find(
        (p) => p.name === 'vite-plugin-qwik'
      ) as any as QwikVitePlugin;
      if (!qwikPlugin) {
        throw new Error('Missing vite-plugin-qwik');
      }

      // Register callback to discover routeLoader$ hashes from optimizer segments
      qwikPlugin.api.onSegment((parentId, segment) => {
        if (segment.ctxName === 'routeLoader$') {
          const normalizedId = normalizePath(parentId);
          const existing = loadersByFile.get(normalizedId) || [];
          existing.push(segment.hash);
          loadersByFile.set(normalizedId, existing);

          // In dev: invalidate @qwik-router-config so trie re-generates with loader info
          if (devServer) {
            const graph = devServer.environments?.ssr?.moduleGraph;
            if (graph) {
              const mod = graph.getModuleById('@qwik-router-config');
              if (mod) {
                ctx!.isDirty = true;
                graph.invalidateModule(mod);
              }
            }
          }
        }
      });
      if (typeof devSsrServer !== 'boolean') {
        // read the old option from qwik plugin
        devSsrServer = qwikPlugin.api._oldDevSsrServer();
      }
      qwikPlugin.api.registerBundleGraphAdder?.((manifest) => {
        return getRouteImports(ctx!.routes, manifest);
      });
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

    async load(id) {
      if (ctx) {
        if (id.endsWith(QWIK_ROUTER_ENTRIES_ID)) {
          // @qwik-router-entries
          return generateQwikRouterEntries(ctx);
        }
        const isRouterConfig = id.endsWith(QWIK_ROUTER_CONFIG_ID);
        const isSwRegister = id.endsWith(QWIK_ROUTER_SW_REGISTER);
        if (isRouterConfig || isSwRegister) {
          if (ctx.isDirty) {
            await parseRoutesDir(ctx);

            ctx.isDirty = false;
            ctx.diagnostics.forEach((d) => {
              this.warn(d.message);
            });
          }

          if (isRouterConfig) {
            // @qwik-router-config
            return generateQwikRouterConfig(
              ctx,
              qwikPlugin!,
              this.environment.config.consumer === 'server',
              loadersByFile
            );
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
      const isVirtualId = id.startsWith('\0');
      if (isVirtualId) {
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
      // Replace __LOADERS:...__ placeholder strings with actual loader hash arrays.
      // Runs even when no routeLoader$ was found so placeholders collapse to `void 0`
      // (otherwise they remain as raw strings and the client iterates them per-character).
      for (const chunk of Object.values(bundles)) {
        if (chunk.type === 'chunk' && chunk.code.includes('__LOADERS:')) {
          chunk.code = replaceLoaderPlaceholders(chunk.code, loadersByFile);
        }
      }
      // Turn entry and service worker chunks into entry points
      if (this.environment.config.consumer === 'client') {
        const entries = [...ctx!.entries, ...ctx!.serviceWorkers].map((entry) => {
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
        if (this.environment.config.consumer === 'server' && outDir) {
          await generateServerPackageJson(outDir);
        }
      },
    },
  };

  return plugin;
}

async function generateServerPackageJson(outDir: string) {
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
    type: 'module',
  };
  const serverPackageJsonCode = JSON.stringify(packageJson, null, 2);

  await fs.promises.writeFile(serverPackageJsonPath, serverPackageJsonCode);
}

/**
 * Separate plugin that tracks modules containing server$ functions during SSR builds and generates
 * `virtual:qwik-router-server-fns` — a virtual module that statically imports all such modules so
 * their `_regSymbol` side effects run before any RPC request arrives.
 */
function serverFnsPlugin(buildContextRef: BuildContextRef): Plugin {
  const RESOLVED_ID = '\0' + VIRTUAL_SERVER_FNS;
  const serverFnModules = new Set<string>();
  let serverFnsReady: Promise<void> | null = null;

  function reset() {
    serverFnModules.clear();
    serverFnsReady = null;
  }
  reset();

  async function collectServerFnModules(this: Rollup.PluginContext) {
    if (serverFnsReady) {
      await serverFnsReady;
      return;
    }

    serverFnsReady = (async () => {
      const ctx = buildContextRef.current;
      if (!ctx) {
        return;
      }
      const moduleIds = await collectServerFnModuleIds(ctx, RESOLVED_ID, this);
      for (let i = 0; i < moduleIds.length; i++) {
        serverFnModules.add(moduleIds[i]);
      }
    })();

    await serverFnsReady;
  }

  return {
    name: 'vite-plugin-qwik-router-server-fns',

    buildStart() {
      reset();
    },

    resolveId(id) {
      if (id === VIRTUAL_SERVER_FNS) {
        return { id: RESOLVED_ID, moduleSideEffects: 'no-treeshake' };
      }
    },

    load: {
      order: 'pre',
      async handler(id) {
        const isServerBuild =
          this.environment.config.consumer === 'server' && this.environment.mode === 'build';

        if (id === RESOLVED_ID) {
          if (isServerBuild) {
            await collectServerFnModules.call(this);
          }
          if (!isServerBuild || serverFnModules.size === 0) {
            return '// No server$ functions';
          }
          return [...serverFnModules].map((mod) => `import ${JSON.stringify(mod)};`).join('\n');
        }
        return null;
      },
    },
  };
}
