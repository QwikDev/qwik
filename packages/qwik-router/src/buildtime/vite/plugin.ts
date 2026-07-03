import swRegister from '../runtime-generation/sw-register-build?compiled-string';
import type { QwikVitePlugin } from '@qwik.dev/core/optimizer';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { findExports } from 'mlly';
import type {
  ConfigEnv,
  EnvironmentOptions,
  HotUpdateOptions,
  Plugin,
  PluginOption,
  Rolldown,
  UserConfig,
  ViteDevServer,
} from 'vite';
import { loadEnv } from 'vite';
import {
  isEntryName,
  isErrorName,
  isIndexModule,
  isLayoutModule,
  isMenuFileName,
  isPluginModule,
  isServiceWorkerName,
  normalizePath,
  removeExtension,
} from '../../utils/fs';
import { parseRoutesDir } from '../build';
import { createBuildContext, resetBuildContext } from '../context';
import { createMdxTransformer, type MdxTransform } from '../markdown/mdx';
import { transformMenu } from '../markdown/menu';
import { generateQwikRouterEntries } from '../runtime-generation/generate-entries';
import { generateQwikRouterConfig } from '../runtime-generation/generate-qwik-router-config';
import type { RouteLoaderSourceFiles } from '../runtime-generation/generate-routes';
import { generateServiceWorkerRegister } from '../runtime-generation/generate-service-worker';
import { getServerExcludedRoutes } from '../runtime-generation/server-exclude';
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
export function replaceLoaderPlaceholders(
  code: string,
  loadersByFile: Map<string, string[]>
): string {
  // Replace `_R: "__LOADERS:path1|path2__"` with the actual hash array, or strip the whole
  // `_R: ...` entry when no routeLoader$ was found — that way the client-side routing code
  // never sees a stale placeholder string and spreads it character-by-character.
  // Quote may be ", ' or ` (minifiers can re-emit as a template literal); pair via backreference.
  return code.replace(
    /_R\s*:\s*(["'`])__LOADERS:(.+?)__\1\s*,?/g,
    (_match, _quote: string, paths: string) => {
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
    }
  );
}

export function addRouteLoaderHash(
  loadersByFile: Map<string, string[]>,
  filePath: string,
  hash: string
) {
  const normalizedPath = normalizePath(filePath);
  const existing = loadersByFile.get(normalizedPath);
  if (!existing) {
    loadersByFile.set(normalizedPath, [hash]);
    return true;
  }
  if (!existing.includes(hash)) {
    existing.push(hash);
    return true;
  }
  return false;
}

export function clearRouteLoaderHashes(loadersByFile: Map<string, string[]>, filePath: string) {
  return loadersByFile.delete(normalizePath(filePath));
}

export function isRouterSourceFilePath(filePath: string) {
  const fileName = basename(filePath);
  const extlessName = removeExtension(fileName);
  return (
    isMenuFileName(fileName) ||
    isIndexModule(extlessName) ||
    isErrorName(extlessName) ||
    isLayoutModule(extlessName) ||
    isEntryName(extlessName) ||
    isServiceWorkerName(extlessName) ||
    isPluginModule(extlessName)
  );
}

function isPathInDir(filePath: string, dirPath: string) {
  return filePath === dirPath || filePath.startsWith(`${dirPath}/`);
}

function isRouterSourceFileForContext(filePath: string, ctx: RoutingContext) {
  const normalizedPath = normalizePath(filePath);
  return (
    isRouterSourceFilePath(normalizedPath) &&
    (isPathInDir(normalizedPath, ctx.opts.routesDir) ||
      isPathInDir(normalizedPath, ctx.opts.serverPluginsDir))
  );
}

function isDiscoveredRouteLoaderSource(
  filePath: string,
  sourceFiles: RouteLoaderSourceFiles | undefined
) {
  if (!sourceFiles) {
    return false;
  }
  const normalizedPath = normalizePath(filePath);
  for (const files of sourceFiles.values()) {
    if (files.includes(normalizedPath)) {
      return true;
    }
  }
  return false;
}

type SourceResolver = (specifier: string, importer: string) => Promise<string | undefined>;

export async function findRouteLoaderSourceFiles(
  ctx: RoutingContext,
  resolveSource: SourceResolver
): Promise<RouteLoaderSourceFiles> {
  const sources = new Map<string, string[]>();
  const owners = new Set<string>();
  collectRouteLoaderOwners(ctx.routeTrie, owners);
  for (const plugin of ctx.serverPlugins) {
    owners.add(plugin.filePath);
  }
  await Promise.all(
    [...owners].map((owner) => collectReExportSources(owner, owner, resolveSource, sources))
  );
  return sources;
}

function collectRouteLoaderOwners(node: RoutingContext['routeTrie'], owners: Set<string>) {
  for (const file of node._files) {
    if (file.type === 'layout' || file.type === 'route') {
      owners.add(file.filePath);
    }
  }
  for (const child of node.children.values()) {
    collectRouteLoaderOwners(child, owners);
  }
}

async function collectReExportSources(
  owner: string,
  filePath: string,
  resolveSource: SourceResolver,
  sources: Map<string, string[]>,
  seen = new Set<string>([owner])
) {
  let code: string, exportEntries: ReturnType<typeof findExports> | null;
  try {
    code = await readFile(filePath, 'utf-8');
    exportEntries = findExports(code);
    if (!exportEntries) {
      return;
    }
  } catch {
    return;
  }
  await Promise.all(
    exportEntries.map(async (exp) => {
      if (!exp.specifier) {
        return;
      }
      const resolved = await resolveSource(exp.specifier, filePath);
      if (!resolved || resolved.charCodeAt(0) === 0) {
        return;
      }
      const resolvedPath = normalizePath(resolved.split(/[?#]/, 1)[0]);
      let ownerSources = sources.get(owner);
      if (!ownerSources) {
        sources.set(owner, (ownerSources = []));
      }
      if (!ownerSources.includes(resolvedPath)) {
        ownerSources.push(resolvedPath);
      }
      if (!seen.has(resolvedPath)) {
        seen.add(resolvedPath);
        await collectReExportSources(owner, resolvedPath, resolveSource, sources, seen);
      }
    })
  );
}

export function invalidateRouterConfigModules(server: ViteDevServer) {
  const modules: NonNullable<ReturnType<ViteDevServer['moduleGraph']['getModuleById']>>[] = [];
  const moduleGraphs = new Set<ViteDevServer['moduleGraph']>();
  moduleGraphs.add(server.moduleGraph);

  const environments = (server as any).environments;
  if (environments) {
    for (const environment of Object.values(environments)) {
      const graph = (environment as any)?.moduleGraph;
      if (graph) {
        moduleGraphs.add(graph);
      }
    }
  }

  for (const graph of moduleGraphs) {
    const mod = graph.getModuleById(QWIK_ROUTER_CONFIG_ID);
    if (mod) {
      graph.invalidateModule(mod);
      modules.push(mod);
    }
  }

  return modules;
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
  let reExportedRouteLoaderSources: RouteLoaderSourceFiles | undefined;
  /** SSG include/exclude from the adapter (see `_setSsgRoutes`); drives the server-route prune. */
  let ssgRoutePatterns: { include?: string[]; exclude?: string[] } | undefined;

  const api: QwikRouterPluginApi = {
    getBasePathname: () => ctx?.opts.basePathname ?? '/',
    getRoutes: () => {
      return ctx?.routes.slice() ?? [];
    },
    getServiceWorkers: () => {
      return ctx?.serviceWorkers.slice() ?? [];
    },
    _setSsgRoutes: (include, exclude) => {
      ssgRoutePatterns = include?.length ? { include, exclude } : undefined;
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
      };
      return updatedViteConfig;
    },

    configEnvironment(name: string, _config: EnvironmentOptions, _env: ConfigEnv) {
      // Use environment name to distinguish server vs client — config.consumer is not yet set
      // at the time this hook is called. Adapters may add their own server environment (e.g. `ssg`),
      // which needs the same externalization as `ssr`.
      if (name === 'ssr' || name === 'ssg') {
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
          const changed = addRouteLoaderHash(loadersByFile, parentId, segment.hash);

          // In dev: invalidate @qwik-router-config so it re-emits _R with loader info.
          if (changed && devServer) {
            invalidateRouterConfigModules(devServer);
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
      const toWatch = [ctx!.opts.routesDir, ctx!.opts.serverPluginsDir];
      server.watcher.add(toWatch);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      server.watcher.on('change', (path) => {
        if (!isRouterSourceFileForContext(path, ctx!)) {
          return;
        }
        clearRouteLoaderHashes(loadersByFile, path);
        ctx!.isDirty = true;
        invalidateRouterConfigModules(server);
      });

      if (userOpts?.devSsrServer !== false) {
        // this callback runs after all other middlewares have been added, so we can SSR as the last middleware
        return () => {
          server.middlewares.use(makeRouterDevMiddleware(server, ctx!));
        };
      }
    },

    hotUpdate({ file, modules }: HotUpdateOptions) {
      const server = devServer;
      if (!server) {
        return;
      }
      const clearedLoaderHashes = clearRouteLoaderHashes(loadersByFile, file);
      if (!ctx) {
        return;
      }
      if (!isRouterSourceFileForContext(file, ctx)) {
        if (
          clearedLoaderHashes ||
          isDiscoveredRouteLoaderSource(file, reExportedRouteLoaderSources)
        ) {
          invalidateRouterConfigModules(server);
          const configModule = this.environment.moduleGraph.getModuleById(QWIK_ROUTER_CONFIG_ID);
          return configModule ? [...modules, configModule] : modules;
        }
        return;
      }
      ctx.isDirty = true;
      invalidateRouterConfigModules(server);
      const configModule = this.environment.moduleGraph.getModuleById(QWIK_ROUTER_CONFIG_ID);
      return configModule ? [...modules, configModule] : modules;
    },

    transformIndexHtml: {
      order: 'pre',
      async handler() {
        if (viteCommand !== 'serve') {
          return;
        }
        return getRouterIndexTags(devServer!);
      },
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
            // In dev server mode, loadersByFile is kept current via onSegment + module
            // invalidation, so pass it directly. In build mode the config is loaded before
            // route files are optimized, so loadersByFile is empty here; pass undefined to
            // emit __LOADERS:...__ placeholders that generateBundle replaces after optimization.
            const isServerConsumer = this.environment.config.consumer === 'server';
            // Prune the deployed SSR plan (drop prerendered server-free routes so their chunks
            // tree-shake out). The adapter's dedicated `ssg` environment renders every page, so it
            // (like the client and dev) keeps the full trie — keyed on the environment name.
            const serverExcludePaths =
              isServerConsumer && !devServer && this.environment.name !== 'ssg'
                ? await getServerExcludedRoutes(ctx, ssgRoutePatterns)
                : undefined;
            reExportedRouteLoaderSources = await findRouteLoaderSourceFiles(
              ctx,
              async (specifier, importer) => {
                const resolved = await this.resolve(specifier, importer, { skipSelf: true });
                return resolved?.id;
              }
            );
            return generateQwikRouterConfig(
              ctx,
              qwikPlugin!,
              isServerConsumer,
              devServer ? loadersByFile : undefined,
              serverExcludePaths,
              reExportedRouteLoaderSources
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
              const err: Rolldown.RolldownError = Object.assign(new Error(e.reason), {
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
      // A separate server build skips onSegment, so recover routeLoader$ hashes from the manifest.
      const manifest = qwikPlugin!.api.getManifest();
      if (manifest) {
        const srcDir = qwikPlugin!.api.getOptions().srcDir!;
        for (const symbol of Object.values(manifest.symbols)) {
          if (symbol.ctxName === 'routeLoader$' && symbol.origin) {
            addRouteLoaderHash(loadersByFile, resolve(srcDir, symbol.origin), symbol.hash);
          }
        }
      }
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

  async function collectServerFnModules(this: Rolldown.PluginContext) {
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
          return [...serverFnModules]
            .map(
              (mod, index) =>
                `import * as serverFnModule${index} from ${JSON.stringify(mod)};\nObject.values(serverFnModule${index});`
            )
            .join('\n');
        }
        return null;
      },
    },
  };
}
