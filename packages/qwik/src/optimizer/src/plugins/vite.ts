import type { Plugin as VitePlugin, UserConfig, ViteDevServer } from 'vite';
import type {
  EntryStrategy,
  GlobalInjections,
  Optimizer,
  OptimizerOptions,
  OptimizerSystem,
  QwikManifest,
  TransformModule,
} from '../types';
import {
  createPlugin,
  NormalizedQwikPluginOptions,
  parseId,
  QwikBuildMode,
  QwikPluginOptions,
  QwikBuildTarget,
  QWIK_CORE_ID,
  Q_MANIFEST_FILENAME,
  QWIK_CLIENT_MANIFEST_ID,
  QWIK_BUILD_ID,
  QwikPackages,
  QWIK_JSX_RUNTIME_ID,
  CLIENT_OUT_DIR,
  QWIK_JSX_DEV_RUNTIME_ID,
} from './plugin';
import { createRollupError, normalizeRollupOutputOptions } from './rollup';
import { configureDevServer, configurePreviewServer, VITE_DEV_CLIENT_QS } from './vite-server';
import { QWIK_LOADER_DEFAULT_DEBUG, QWIK_LOADER_DEFAULT_MINIFIED } from '../scripts';
import { versions } from '../versions';

const DEDUPE = [QWIK_CORE_ID, QWIK_JSX_RUNTIME_ID, QWIK_JSX_DEV_RUNTIME_ID];

/**
 * @alpha
 */
export function qwikVite(qwikViteOpts: QwikVitePluginOptions = {}): any {
  let isClientDevOnly = false;
  let clientDevInput: undefined | string = undefined;
  let tmpClientManifestPath: undefined | string = undefined;
  let viteCommand: 'build' | 'serve' = 'serve';
  let manifestInput: QwikManifest | null = null;
  let clientOutDir: string | null = null;
  const injections: GlobalInjections[] = [];
  const qwikPlugin = createPlugin(qwikViteOpts.optimizerOptions);

  const api: QwikVitePluginApi = {
    getOptimizer: () => qwikPlugin.getOptimizer(),
    getOptions: () => qwikPlugin.getOptions(),
    getManifest: () => manifestInput,
    getRootDir: () => qwikPlugin.getOptions().rootDir,
    getClientOutDir: () => clientOutDir,
  };

  const vitePlugin: VitePlugin = {
    name: 'vite-plugin-qwik',
    enforce: 'pre',
    api,

    async config(viteConfig, viteEnv) {
      await qwikPlugin.init();

      const sys = qwikPlugin.getSys();
      const path = qwikPlugin.getPath();

      viteCommand = viteEnv.command;
      isClientDevOnly = viteCommand === 'serve' && viteEnv.mode !== 'ssr';

      qwikPlugin.log(`vite config(), command: ${viteCommand}, env.mode: ${viteEnv.mode}`);

      let target: QwikBuildTarget;
      if (viteConfig.build?.ssr || viteEnv.mode === 'ssr') {
        target = 'ssr';
      } else if (viteEnv.mode === 'lib') {
        target = 'lib';
      } else {
        target = 'client';
      }

      let buildMode: QwikBuildMode;
      if (viteEnv.mode === 'production') {
        buildMode = 'production';
      } else if (viteEnv.mode === 'development') {
        buildMode = 'development';
      } else if (viteCommand === 'build' && target === 'client') {
        // build (production)
        buildMode = 'production';
      } else {
        // serve (development)
        buildMode = 'development';
      }

      let forceFullBuild = true;
      if (viteCommand === 'serve') {
        qwikViteOpts.entryStrategy = { type: 'hook' };
        forceFullBuild = false;
      } else {
        if (target === 'ssr' || target === 'lib') {
          qwikViteOpts.entryStrategy = { type: 'inline' };
        }
        forceFullBuild = true;
      }

      const shouldFindVendors = target === 'client' || viteCommand === 'serve';
      const vendorRoots = shouldFindVendors
        ? await findQwikRoots(sys, path.join(sys.cwd(), 'package.json'))
        : [];
      const pluginOpts: QwikPluginOptions = {
        target,
        buildMode,
        debug: qwikViteOpts.debug,
        entryStrategy: qwikViteOpts.entryStrategy,
        rootDir: viteConfig.root,
        resolveQwikBuild: viteCommand === 'build',
        transformedModuleOutput: qwikViteOpts.transformedModuleOutput,
        forceFullBuild,
        vendorRoots: vendorRoots.map((v) => v.path),
      };

      if (target === 'ssr') {
        // ssr
        if (typeof viteConfig.build?.ssr === 'string') {
          // from --ssr flag user config
          // entry.server.ts (express/cloudflare/netlify)
          pluginOpts.input = viteConfig.build.ssr;
        } else if (typeof qwikViteOpts.ssr?.input === 'string') {
          // entry.ssr.tsx input (exports render())
          pluginOpts.input = qwikViteOpts.ssr.input;
        }

        pluginOpts.outDir = qwikViteOpts.ssr?.outDir;
        pluginOpts.manifestInput = qwikViteOpts.ssr?.manifestInput;
      } else if (target === 'client') {
        // client
        pluginOpts.input = qwikViteOpts.client?.input;
        pluginOpts.outDir = qwikViteOpts.client?.outDir;
        pluginOpts.manifestOutput = qwikViteOpts.client?.manifestOutput;
      } else {
        if (typeof viteConfig.build?.lib === 'object') {
          pluginOpts.input = viteConfig.build?.lib.entry;
        }
        pluginOpts.outDir = viteConfig.build?.outDir;
      }

      if (sys.env === 'node') {
        const fs: typeof import('fs') = await sys.dynamicImport('node:fs');

        try {
          const rootDir = pluginOpts.rootDir ?? sys.cwd();
          const packageJsonPath = sys.path.join(rootDir, 'package.json');
          const pkgString = await fs.promises.readFile(packageJsonPath, 'utf-8');

          try {
            const data = JSON.parse(pkgString);

            if (typeof data.name === 'string') {
              pluginOpts.scope = data.name;
            }
          } catch (e) {
            console.error(e);
          }
        } catch (e) {
          // error reading package.json from nodejs fs, ok to ignore
        }

        // In a NodeJs environment, create a path to a q-manifest.json file within the
        // OS tmp directory. This path should always be the same for both client and ssr.
        // Client build will write to this path, and SSR will read from it. For this reason,
        // the Client build should always start and finish before the SSR build.
        const nodeOs: typeof import('os') = await sys.dynamicImport('node:os');
        tmpClientManifestPath = path.join(nodeOs.tmpdir(), `vite-plugin-qwik-q-manifest.json`);

        if (target === 'ssr' && !pluginOpts.manifestInput) {
          // This is a SSR build so we should load the client build's manifest
          // so it can be used as the manifestInput of the SSR build
          try {
            const clientManifestStr = await fs.promises.readFile(tmpClientManifestPath, 'utf-8');
            pluginOpts.manifestInput = JSON.parse(clientManifestStr);
          } catch (e) {
            /**/
          }
        }
      }

      const opts = qwikPlugin.normalizeOptions(pluginOpts);

      manifestInput = pluginOpts.manifestInput || null;

      clientOutDir = qwikPlugin.normalizePath(
        sys.path.resolve(opts.rootDir, qwikViteOpts.client?.outDir || CLIENT_OUT_DIR)
      );

      // TODO: Remove globalThis that was previously used. Left in for backwards compatibility.
      (globalThis as any).QWIK_MANIFEST = manifestInput;
      (globalThis as any).QWIK_CLIENT_OUT_DIR = clientOutDir;

      if (typeof qwikViteOpts.client?.devInput === 'string') {
        clientDevInput = path.resolve(opts.rootDir, qwikViteOpts.client.devInput);
      } else {
        if (opts.srcDir) {
          clientDevInput = path.resolve(opts.srcDir, CLIENT_DEV_INPUT);
        } else {
          clientDevInput = path.resolve(opts.rootDir, 'src', CLIENT_DEV_INPUT);
        }
      }
      clientDevInput = qwikPlugin.normalizePath(clientDevInput);

      const vendorIds = vendorRoots.map((v) => v.id);
      const updatedViteConfig: UserConfig = {
        resolve: {
          dedupe: [...DEDUPE, ...vendorIds],
          conditions: [],
        },
        esbuild:
          viteCommand === 'serve'
            ? false
            : {
                logLevel: 'error',
                jsx: 'preserve',
              },
        optimizeDeps: {
          exclude: [
            '@vite/client',
            '@vite/env',
            QWIK_CORE_ID,
            QWIK_JSX_RUNTIME_ID,
            QWIK_JSX_DEV_RUNTIME_ID,
            QWIK_BUILD_ID,
            QWIK_CLIENT_MANIFEST_ID,
            ...vendorIds,
          ],
        },
        build: {
          outDir: opts.outDir,
          rollupOptions: {
            input: opts.input,
            preserveEntrySignatures: 'exports-only',
            output: normalizeRollupOutputOptions(path, opts, {}),
            treeshake: {
              moduleSideEffects: false,
            },
            onwarn: (warning, warn) => {
              if (
                warning.plugin === 'typescript' &&
                warning.message.includes('outputToFilesystem')
              ) {
                return;
              }
              warn(warning);
            },
          },
          modulePreload: {
            polyfill: false,
          },
          dynamicImportVarsOptions: {
            exclude: [/./],
          },
        },
      };

      if (buildMode === 'development') {
        (globalThis as any).qDev = true;
        const qDevKey = 'globalThis.qDev';
        const qSerializeKey = 'globalThis.qSerialize';
        updatedViteConfig.define = {
          [qDevKey]: viteConfig?.define?.[qDevKey] ?? true,
          [qSerializeKey]: viteConfig?.define?.[qSerializeKey] ?? true,
        };
      }

      if (opts.target === 'ssr') {
        // SSR Build
        if (viteCommand === 'serve') {
          updatedViteConfig.ssr = {
            noExternal: vendorIds,
          };
        } else {
          updatedViteConfig.publicDir = false;
          updatedViteConfig.build!.ssr = true;
          if (viteConfig.build?.minify == null && buildMode === 'production') {
            updatedViteConfig.build!.minify = 'esbuild';
          }
        }
      } else if (opts.target === 'client') {
        if (buildMode === 'production') {
          updatedViteConfig.resolve!.conditions = ['min'];
        }
        // Client Build
        if (isClientDevOnly) {
          updatedViteConfig.build!.rollupOptions!.input = clientDevInput;
        }
      } else if (opts.target === 'lib') {
        // Library Build
        updatedViteConfig.build!.minify = false;
      }

      return updatedViteConfig;
    },

    async buildStart() {
      // Using vite.resolveId to check file if exist
      // for example input might be virtual file
      const resolver = this.resolve.bind(this);
      await qwikPlugin.validateSource(resolver);

      qwikPlugin.onAddWatchFile((ctx, path) => {
        ctx.addWatchFile(path);
      });

      qwikPlugin.onDiagnostics((diagnostics, optimizer, srcDir) => {
        diagnostics.forEach((d) => {
          const id = qwikPlugin.normalizePath(optimizer.sys.path.join(srcDir, d.file));
          if (d.category === 'error') {
            this.error(createRollupError(id, d));
          } else {
            this.warn(createRollupError(id, d));
          }
        });
      });

      await qwikPlugin.buildStart(this);
    },

    resolveId(id, importer, resolveIdOpts) {
      if (id.startsWith('\0')) {
        return null;
      }
      if (isClientDevOnly && id === VITE_CLIENT_MODULE) {
        return id;
      }
      return qwikPlugin.resolveId(this, id, importer, resolveIdOpts);
    },

    load(id, loadOpts) {
      if (id.startsWith('\0')) {
        return null;
      }

      id = qwikPlugin.normalizePath(id);
      const opts = qwikPlugin.getOptions();

      if (isClientDevOnly && id === VITE_CLIENT_MODULE) {
        return getViteDevModule(opts);
      }
      if (viteCommand === 'serve' && id.endsWith(QWIK_CLIENT_MANIFEST_ID)) {
        return {
          code: 'export const manifest = undefined;',
        };
      }
      return qwikPlugin.load(this, id, loadOpts);
    },

    transform(code, id) {
      if (id.startsWith('\0')) {
        return null;
      }
      if (isClientDevOnly) {
        const parsedId = parseId(id);
        if (parsedId.params.has(VITE_DEV_CLIENT_QS)) {
          code = updateEntryDev(code);
        }
      }
      return qwikPlugin.transform(this, code, id);
    },

    async generateBundle(_, rollupBundle) {
      const opts = qwikPlugin.getOptions();

      if (opts.target === 'client') {
        // client build
        const outputAnalyzer = qwikPlugin.createOutputAnalyzer();

        for (const fileName in rollupBundle) {
          const b = rollupBundle[fileName];
          if (b.type === 'chunk') {
            outputAnalyzer.addBundle({
              fileName,
              modules: b.modules,
              imports: b.imports,
              dynamicImports: b.dynamicImports,
              size: b.code.length,
            });
          } else {
            if (['.css', '.scss', '.sass'].some((ext) => fileName.endsWith(ext))) {
              injections.push({
                tag: 'link',
                location: 'head',
                attributes: {
                  rel: 'stylesheet',
                  href: `/${fileName}`,
                },
              });
            }
          }
        }

        for (const i of injections) {
          outputAnalyzer.addInjection(i);
        }

        const optimizer = qwikPlugin.getOptimizer();
        const manifest = await outputAnalyzer.generateManifest();
        manifest.platform = {
          ...versions,
          vite: '',
          rollup: this.meta?.rollupVersion || '',
          env: optimizer.sys.env,
          os: optimizer.sys.os,
        };
        if (optimizer.sys.env === 'node') {
          manifest.platform.node = process.versions.node;
        }

        const clientManifestStr = JSON.stringify(manifest, null, 2);
        this.emitFile({
          type: 'asset',
          fileName: Q_MANIFEST_FILENAME,
          source: clientManifestStr,
        });

        if (typeof opts.manifestOutput === 'function') {
          await opts.manifestOutput(manifest);
        }

        if (typeof opts.transformedModuleOutput === 'function') {
          await opts.transformedModuleOutput(qwikPlugin.getTransformedOutputs());
        }

        const sys = qwikPlugin.getSys();
        if (tmpClientManifestPath && sys.env === 'node') {
          // Client build should write the manifest to a tmp dir
          const fs: typeof import('fs') = await sys.dynamicImport('node:fs');
          await fs.promises.writeFile(tmpClientManifestPath, clientManifestStr);
        }
      }
    },

    async writeBundle(_, rollupBundle) {
      const opts = qwikPlugin.getOptions();
      if (opts.target === 'ssr') {
        // ssr build

        const sys = qwikPlugin.getSys();
        if (sys.env === 'node') {
          const outputs = Object.keys(rollupBundle);

          // In order to simplify executing the server script with a common script
          // always ensure there's a plain .js file.
          // For example, if only a .mjs was generated, also
          // create the .js file that just calls the .mjs file
          const patchModuleFormat = async (bundeName: string) => {
            try {
              const bundleFileName = sys.path.basename(bundeName);
              const ext = sys.path.extname(bundleFileName);
              if (
                bundleFileName.startsWith('entry.') &&
                !bundleFileName.includes('preview') &&
                (ext === '.mjs' || ext === '.cjs')
              ) {
                const extlessName = sys.path.basename(bundleFileName, ext);
                const js = `${extlessName}.js`;
                const moduleName = extlessName + ext;

                const hasJsScript = outputs.some((f) => sys.path.basename(f) === js);
                if (!hasJsScript) {
                  // didn't generate a .js script
                  // create a .js file that just import()s their script
                  const bundleOutDir = sys.path.dirname(bundeName);
                  const fs: typeof import('fs') = await sys.dynamicImport('node:fs');

                  const folder = sys.path.join(opts.outDir, bundleOutDir);
                  await fs.promises.mkdir(folder, { recursive: true });
                  await fs.promises.writeFile(
                    sys.path.join(folder, js),
                    `export * from "./${moduleName}";`
                  );
                }
              }
            } catch (e) {
              console.error('patchModuleFormat', e);
            }
          };

          await Promise.all(outputs.map(patchModuleFormat));
        }
      }
    },

    async configureServer(server: ViteDevServer) {
      const opts = qwikPlugin.getOptions();
      const sys = qwikPlugin.getSys();
      const path = qwikPlugin.getPath();
      await configureDevServer(server, opts, sys, path, isClientDevOnly, clientDevInput);
    },

    configurePreviewServer(server) {
      return async () => {
        const opts = qwikPlugin.getOptions();
        const sys = qwikPlugin.getSys();
        const path = qwikPlugin.getPath();
        await configurePreviewServer(server.middlewares, opts, sys, path);
      };
    },

    handleHotUpdate(ctx) {
      qwikPlugin.log('handleHotUpdate()', ctx);

      if (['.css', '.scss', '.sass'].some((ext) => ctx.file.endsWith(ext))) {
        qwikPlugin.log('handleHotUpdate()', 'force css reload');

        ctx.server.ws.send({
          type: 'full-reload',
        });
        return [];
      }
    },
  };

  return vitePlugin;
}

function updateEntryDev(code: string) {
  code = code.replace(/("|')@builder.io\/qwik("|')/g, `'${VITE_CLIENT_MODULE}'`);
  return code;
}

function getViteDevModule(opts: NormalizedQwikPluginOptions) {
  const qwikLoader = JSON.stringify(
    opts.debug ? QWIK_LOADER_DEFAULT_DEBUG : QWIK_LOADER_DEFAULT_MINIFIED
  );

  return `// Qwik Vite Dev Module
import { render as qwikRender } from '@builder.io/qwik';

export async function render(document, rootNode, opts) {

  await qwikRender(document, rootNode, opts);

  let qwikLoader = document.getElementById('qwikloader');
  if (!qwikLoader) {
    qwikLoader = document.createElement('script');
    qwikLoader.id = 'qwikloader';
    qwikLoader.innerHTML = ${qwikLoader};
    const parent = document.head ?? document.body ?? document.documentElement;
    parent.appendChild(qwikLoader);
  }

  if (!window.__qwikViteLog) {
    window.__qwikViteLog = true;
    console.debug("%c⭐️ Qwik Client Mode","background: #0c75d2; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;","Do not use this mode in production!\\n - No portion of the application is pre-rendered on the server\\n - All of the application is running eagerly in the browser\\n - Optimizer/Serialization/Deserialization code is not exercised!");
  }
}`;
}

const findQwikRoots = async (
  sys: OptimizerSystem,
  packageJsonPath: string
): Promise<QwikPackages[]> => {
  if (sys.env === 'node') {
    const fs: typeof import('fs') = await sys.dynamicImport('node:fs');
    const { resolvePackageData }: typeof import('vite') = await sys.strictDynamicImport('vite');

    try {
      const data = await fs.promises.readFile(packageJsonPath, { encoding: 'utf-8' });

      try {
        const packageJson = JSON.parse(data);
        const dependencies = packageJson['dependencies'];
        const devDependencies = packageJson['devDependencies'];

        const packages: string[] = [];
        if (typeof dependencies === 'object') {
          packages.push(...Object.keys(dependencies));
        }
        if (typeof devDependencies === 'object') {
          packages.push(...Object.keys(devDependencies));
        }

        const basedir = sys.cwd();
        const qwikDirs = packages
          .map((id) => {
            const pkgData = resolvePackageData(id, basedir);
            if (pkgData) {
              const qwikPath = pkgData.data['qwik'];
              if (qwikPath) {
                return {
                  id,
                  path: sys.path.resolve(pkgData.dir, qwikPath),
                };
              }
            }
          })
          .filter(isNotNullable);
        return qwikDirs;
      } catch (e) {
        console.error(e);
      }
    } catch (e) {
      // ignore errors if root package.json not found
    }
  }
  return [];
};

export const isNotNullable = <T>(v: T): v is NonNullable<T> => {
  return v != null;
};

const VITE_CLIENT_MODULE = `@builder.io/qwik/vite-client`;
const CLIENT_DEV_INPUT = 'entry.dev.tsx';

/**
 * @alpha
 */
export interface QwikVitePluginOptions {
  /**
   * Prints verbose Qwik plugin debug logs.
   * Default `false`
   */
  debug?: boolean;
  /**
   * The Qwik entry strategy to use while bunding for production.
   * During development the type is always `hook`.
   * Default `{ type: "smart" }`)
   */
  entryStrategy?: EntryStrategy;
  /**
   * The source directory to find all the Qwik components. Since Qwik
   * does not have a single input, the `srcDir` is use to recursively
   * find Qwik files.
   * Default `src`
   */
  srcDir?: string;
  client?: {
    /**
     * The entry point for the client builds. Typically this would be
     * the application's main component.
     * Default `src/components/app/app.tsx`
     */
    input?: string[] | string;
    /**
     * Entry input for client-side only development with hot-module reloading.
     * This is for Vite development only and does not use SSR.
     * Default `src/entry.dev.tsx`
     */
    devInput?: string;
    /**
     * Output directory for the client build.
     * Default `dist`
     */
    outDir?: string;
    /**
     * The client build will create a manifest and this hook
     * is called with the generated build data.
     * Default `undefined`
     */
    manifestOutput?: (manifest: QwikManifest) => Promise<void> | void;
  };
  ssr?: {
    /**
     * The entry point for the SSR renderer. This file should export
     * a `render()` function. This entry point and `render()` export
     * function is also used for Vite's SSR development and Nodejs
     * debug mode.
     * Default `src/entry.ssr.tsx`
     */
    input?: string;
    /**
     * Output directory for the server build.
     * Default `dist`
     */
    outDir?: string;
    /**
     * The SSR build requires the manifest generated during the client build.
     * By default, this plugin will wire the client manifest to the ssr build.
     * However, the `manifestInput` option can be used to manually provide a manifest.
     * Default `undefined`
     */
    manifestInput?: QwikManifest;
  };
  optimizerOptions?: OptimizerOptions;
  /**
   * Hook that's called after the build and provides all of the transformed
   * modules that were used before bundling.
   */
  transformedModuleOutput?:
    | ((transformedModules: TransformModule[]) => Promise<void> | void)
    | null;
}

/**
 * @alpha
 */
export interface QwikVitePluginApi {
  getOptimizer: () => Optimizer | null;
  getOptions: () => NormalizedQwikPluginOptions;
  getManifest: () => QwikManifest | null;
  getRootDir: () => string | null;
  getClientOutDir: () => string | null;
}

/**
 * @alpha
 */
export interface QwikVitePlugin {
  name: 'vite-plugin-qwik';
  api: QwikVitePluginApi;
}

export interface QwikViteDevResponse {
  _qwikEnvData?: Record<string, any>;
}
