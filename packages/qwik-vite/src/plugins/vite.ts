import { isLinkedBuildId } from './linked-build';
import type {
  ConfigEnv,
  EnvironmentOptions,
  UserConfig,
  ViteDevServer,
  Plugin as VitePlugin,
} from 'vite';
import type {
  EntryStrategy,
  GlobalInjections,
  Optimizer,
  OptimizerOptions,
  QwikManifest,
  SegmentAnalysis,
  TransformModule,
} from '../types';
import { type BundleGraphAdder } from './bundle-graph';
import { configurePreviewServer, getViteIndexTags } from './dev';
import { getImageSizeServer } from './dev/image-size-server';
import {
  createQwikPlugin,
  QWIK_BUILD_ID,
  QWIK_CLIENT_MANIFEST_ID,
  QWIK_CORE_ID,
  QWIK_CORE_SERVER,
  QWIK_JSX_DEV_RUNTIME_ID,
  QWIK_JSX_RUNTIME_ID,
  TRANSFORM_REGEX,
  type ExperimentalFeatures,
  type NormalizedQwikPluginOptions,
  type QwikBuildMode,
  type QwikBuildTarget,
  type QwikPluginDevTools,
  type QwikPluginOptions,
} from './plugin';
import { createBundlerError, normalizeRolldownOutputOptions } from './rolldown';
import { isVirtualId } from './vite-utils';
import {
  emitQwikWorkerCoreChunk,
  getQwikWorkerConfig,
  isQwikWorkerCoreId,
  loadQwikWorkerCore,
  QWIK_WORKER_CORE_ID,
  rewriteClientWorkerCorePlaceholders,
  rewriteSsrWorkerCorePlaceholders,
} from './worker-core';
import {
  createBuildWorkerQrlChunkResolver,
  rewriteWorkerQrlChunkPlaceholders,
} from './worker-qrl-chunks';
import { createTestResume } from './test-resume';

const DEDUPE = [
  QWIK_CORE_ID,
  QWIK_JSX_RUNTIME_ID,
  QWIK_JSX_DEV_RUNTIME_ID,
  '@builder.io/qwik',
  '@builder.io/qwik/jsx-runtime',
  '@builder.io/qwik/jsx-dev-runtime',
];

const STYLING = ['.css', '.scss', '.sass', '.less', '.styl', '.stylus'];

const QWIK_HMR_BRIDGE_ID = '@qwik-hmr-bridge';
/**
 * Client-side HMR bridge: listens for qwik:hmr events from the server and dispatches events for
 * each changed file. These events then call _hmr on the specific component that changed, causing it
 * to re-render, even if it was paused.
 */
const QWIK_HMR_BRIDGE_CODE = `
  // HMR bridge: connects Vite HMR events to Qwik's component re-rendering.
  if (import.meta.hot) {
    let timeout;
    import.meta.hot.on("qwik:hmr", (data) => {
      if (data.t === document.__hmrT) {
        console.log("Received duplicate HMR update, ignoring", data.files);
        return;
      }
      clearTimeout(timeout);
      document.__hmrT = data.t;
      document.__hmrDone = 0;
      document.dispatchEvent(
        new CustomEvent("qHmr", { detail: data })
      );
      timeout = setTimeout(() => {
      console.log(document.__hmrDone, document.__hmrT);
        if (document.__hmrDone !== document.__hmrT) {
          console.log("HMR update did not match active code, reloading the page", location.href);
          location.reload();
        }
      }, 500);
    });
  }
`;

/**
 * Workaround to make the api be defined in the type.
 *
 * @internal
 */
type P<T> = VitePlugin<T> & { api: T; config: Extract<VitePlugin<T>['config'], Function> };

/**
 * The types for Vite/Rolldown don't allow us to be too specific about the return type. The correct
 * return type is `[QwikVitePlugin, VitePlugin<never>]`, and if you search the plugin by name you'll
 * get the `QwikVitePlugin`.
 *
 * @public
 */
export function qwikVite(qwikViteOpts: QwikVitePluginOptions = {}): any {
  let viteCommand: 'build' | 'serve' = 'serve';
  let clientOutDir: string | null = null;
  let basePathname: string = '/';
  let clientPublicOutDir: string | null = null;
  let srcDir: string | null = null;
  let rootDir: string | null = null;

  let ssrOutDir: string | null = null;
  let buildMode: QwikBuildMode = 'development';
  let viteServer: ViteDevServer | undefined;
  let workerCoreChunkRef: string | undefined;
  // Cache the user-specified clientOutDir to use across multiple normalizeOptions calls
  const userClientOutDir = qwikViteOpts.client?.outDir;
  // Cache the resolved plugin options from config() to reuse in configResolved()
  let cachedPluginOpts: QwikPluginOptions | null = null;
  const fileFilter: QwikVitePluginOptions['fileFilter'] = qwikViteOpts.fileFilter
    ? (id, type) => TRANSFORM_REGEX.test(id) || qwikViteOpts.fileFilter!(id, type)
    : () => true;
  const injections: GlobalInjections[] = [];
  const testResume = createTestResume();
  const qwikPlugin = createQwikPlugin(qwikViteOpts.optimizerOptions, testResume);

  const bundleGraphAdders = new Set<BundleGraphAdder>();

  const api: QwikVitePluginApi = {
    getOptimizer: () => qwikPlugin.getOptimizer(),
    getOptions: () => qwikPlugin.getOptions(),
    getManifest: () => qwikPlugin.getOptions().manifestInput,
    getRootDir: () => qwikPlugin.getOptions().rootDir,
    getClientOutDir: () => clientOutDir,
    getClientPublicOutDir: () => clientPublicOutDir,
    registerBundleGraphAdder: (adder: BundleGraphAdder) => bundleGraphAdders.add(adder),
    onSegment: (callback: SegmentCallback) => {
      qwikPlugin.segmentCallbacks.add(callback);
    },
    _oldDevSsrServer: () => qwikViteOpts.devSsrServer,
  };

  // We provide two plugins to Vite. The first plugin is the main plugin that handles all the
  // Vite hooks. The second plugin is a post plugin that is called after the build has finished.
  // The post plugin is used to generate the Qwik manifest file that is used during SSR to
  // generate QRLs for event handlers.
  const vitePluginPre: P<QwikVitePluginApi> = {
    name: 'vite-plugin-qwik',
    enforce: 'pre',
    api,

    async config(viteConfig, viteEnv) {
      await qwikPlugin.init();

      let target: QwikBuildTarget;
      if (viteEnv.mode === 'lib') {
        target = 'lib';
      } else if (viteConfig.build?.ssr || viteEnv.mode === 'ssr') {
        target = 'ssr';
      } else if (viteEnv.mode === 'test' || viteEnv.mode === 'benchmark') {
        target = 'test';
      } else {
        target = 'client';
      }

      viteCommand = viteEnv.command;

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

      qwikPlugin.debug(`vite config(), command: ${viteCommand}, env.mode: ${viteEnv.mode}`);

      if (viteCommand === 'serve') {
        qwikViteOpts.entryStrategy = { type: 'segment' };
      } else {
        if (target === 'ssr') {
          qwikViteOpts.entryStrategy = { type: 'hoist' };
        } else if (target === 'lib') {
          qwikViteOpts.entryStrategy = { type: 'inline' };
        }
      }
      // Special case: build.ssr can be the input for the ssr build
      const ssrInput =
        target === 'ssr'
          ? typeof viteConfig.build?.ssr === 'string'
            ? viteConfig.build.ssr
            : qwikViteOpts.ssr?.input
          : undefined;
      const clientInput = target === 'client' ? qwikViteOpts.client?.input : undefined;
      // Vite's lib mode owns its entry; the linked build still has to know it as the entry.
      const libraryInput = viteConfig.build?.lib ? viteConfig.build.lib.entry : undefined;
      let input = viteConfig.build?.rolldownOptions?.input || clientInput || ssrInput;
      if (input && typeof input === 'string') {
        input = [input];
      }
      const pluginOpts: QwikPluginOptions = {
        target,
        buildMode,
        csr: qwikViteOpts.csr,
        debug: qwikViteOpts.debug,
        entryStrategy: qwikViteOpts.entryStrategy,
        srcDir: qwikViteOpts.srcDir,
        rootDir: viteConfig.root,
        tsconfigFileNames: qwikViteOpts.tsconfigFileNames,
        resolveQwikBuild: true,
        transformedModuleOutput: qwikViteOpts.transformedModuleOutput,
        outDir: viteConfig.build?.outDir,
        ssrOutDir: qwikViteOpts.ssr?.outDir || viteConfig.build?.outDir,
        clientOutDir:
          userClientOutDir ||
          // When ssr is true, this is probably an adapter build and not where the client build is
          // However, if client.outDir was explicitly set, always use it
          (viteConfig.build?.ssr && !userClientOutDir ? undefined : viteConfig.build?.outDir),
        devTools: qwikViteOpts.devTools,
        sourcemap: !!viteConfig.build?.sourcemap,
        lint: qwikViteOpts.lint,
        experimental: qwikViteOpts.experimental,
        testTarget: target === 'test' ? qwikViteOpts.testTarget : undefined,
        input: input || libraryInput,
        manifestInput: qwikViteOpts.ssr?.manifestInput,
        manifestInputPath: qwikViteOpts.ssr?.manifestInputPath,
        manifestOutput: qwikViteOpts.client?.manifestOutput,
      };

      const opts = await qwikPlugin.normalizeOptions(pluginOpts);
      if (libraryInput === undefined) {
        input ||= opts.input;
      }

      // Cache pluginOpts for use in configResolved()
      cachedPluginOpts = pluginOpts;

      srcDir = opts.srcDir;
      rootDir = opts.rootDir;

      if (!qwikViteOpts.csr) {
        clientOutDir = opts.clientOutDir;

        // Don't join base to clientOutDir - vite handles the base internally for assets.
        clientPublicOutDir = clientOutDir;

        ssrOutDir = opts.ssrOutDir;
      }

      const isDevelopment = buildMode === 'development';
      const qDevKey = 'globalThis.qDev';
      const qTestKey = 'globalThis.qTest';
      const qInspectorKey = 'globalThis.qInspector';
      const qDev = viteConfig?.define?.[qDevKey] ?? isDevelopment;
      const qInspector = viteConfig?.define?.[qInspectorKey] ?? isDevelopment;

      const updatedViteConfig: UserConfig = {
        // Duplicated in configEnvironment to support legacy vite build --ssr compatibility
        ssr: {
          // Resume imports must reach client resolution before SSR externalization.
          noExternal: testResume.isResume()
            ? true
            : [QWIK_CORE_ID, QWIK_CORE_SERVER, QWIK_BUILD_ID],
        },
        envPrefix: ['VITE_', 'PUBLIC_'],
        resolve: {
          dedupe: [...DEDUPE],
          alias: {
            '@builder.io/qwik': '@qwik.dev/core',
            '@builder.io/qwik/build': '@qwik.dev/core/build',
            '@builder.io/qwik/server': '@qwik.dev/core/server',
            '@builder.io/qwik/preloader': '@qwik.dev/core/preloader',
            '@builder.io/qwik/jsx-runtime': '@qwik.dev/core/jsx-runtime',
            '@builder.io/qwik/jsx-dev-runtime': '@qwik.dev/core/jsx-dev-runtime',
            '@builder.io/qwik/optimizer': '@qwik.dev/core/optimizer',
            '@builder.io/qwik/loader': '@qwik.dev/core/loader',
            '@builder.io/qwik/cli': '@qwik.dev/core/cli',
          },
        },
        optimizeDeps: {
          noDiscovery: testResume.isResume() || undefined,
          exclude: [
            // using optimized deps for qwik libraries will lead to duplicate imports
            // this breaks Qwik because it relies a lot on module scoped symbols
            QWIK_CORE_ID,
            QWIK_CORE_SERVER,
            QWIK_JSX_RUNTIME_ID,
            QWIK_JSX_DEV_RUNTIME_ID,
            QWIK_BUILD_ID,
            QWIK_CLIENT_MANIFEST_ID,
            '@builder.io/qwik',
          ],
          // Enforce scanning our input even when overridden later
          entries:
            input &&
            (typeof input === 'string'
              ? [input]
              : typeof input === 'object'
                ? Object.values(input)
                : input),
        },
        build: {
          modulePreload: false,
          dynamicImportVarsOptions: {
            exclude: [/./],
          },
          rolldownOptions: {
            external: ['node:async_hooks'],
            // This will amend the existing input
            input,
            experimental: {
              // Rolldown's default 'simple' leaks provenance comments into lib output.
              attachDebugInfo:
                viteConfig.build?.rolldownOptions?.experimental?.attachDebugInfo ?? 'none',
            },
          },
        },
        worker: getQwikWorkerConfig(viteConfig.worker, target, viteCommand),
        define: {
          [qDevKey]: qDev,
          [qInspectorKey]: qInspector,
          [qTestKey]: JSON.stringify(process.env.NODE_ENV === 'test'),
          ...(opts.target === 'test'
            ? {
                'globalThis.qwikTestTarget': JSON.stringify(opts.testTarget),
              }
            : {}),
        },
      };

      if (!qwikViteOpts.csr) {
        updatedViteConfig.build!.cssCodeSplit = false;
        if (opts.outDir) {
          updatedViteConfig.build!.outDir = opts.outDir;
        }
        updatedViteConfig.build!.rolldownOptions = {
          ...updatedViteConfig.build!.rolldownOptions,
          output: normalizeRolldownOutputOptions(
            qwikPlugin,
            viteConfig.build?.rolldownOptions?.output
          ),
          // Rolldown's default 'exports-only' is invalid with includeDependenciesRecursively:false.
          preserveEntrySignatures: 'allow-extension',
        };

        if (opts.target === 'ssr') {
          // SSR Build
          if (viteCommand === 'build') {
            updatedViteConfig.publicDir = false;
            updatedViteConfig.build!.ssr = true;
            if (viteConfig.build?.minify == null && buildMode === 'production') {
              updatedViteConfig.build!.minify = true;
            }
          }
        } else if (opts.target === 'client') {
          // nothing
        } else if (opts.target === 'lib') {
          // Library Build
          updatedViteConfig.build!.minify = false;
          updatedViteConfig.build!.rolldownOptions.external = [
            QWIK_CORE_ID,
            QWIK_CORE_SERVER,
            QWIK_JSX_RUNTIME_ID,
            QWIK_JSX_DEV_RUNTIME_ID,
            QWIK_BUILD_ID,
            QWIK_CLIENT_MANIFEST_ID,
          ];
          // Dual flavor: the same `vite build --mode lib` also emits the client-compiled
          // runtime entry. Consumer apps resolve it in client environments so resumed QRLs
          // load client implementations by symbol.
          const libInput = viteConfig.build?.rolldownOptions?.input ?? libraryInput;
          const clientLibEntry =
            libInput && typeof libInput === 'object' && !Array.isArray(libInput)
              ? (libInput as Record<string, string>).index
              : typeof libInput === 'string'
                ? libInput
                : undefined;
          if (viteCommand === 'build' && clientLibEntry) {
            // Move the user's rolldown inputs/outputs to the ssr environment so the client
            // environment does not inherit them through config merging.
            const userRolldownOptions = viteConfig.build?.rolldownOptions;
            if (viteConfig.build?.rolldownOptions) {
              viteConfig.build.rolldownOptions = {};
            }
            // the ssr environment owns the lib inputs and outputs; keep them out of the
            // client environment (top-level rolldownOptions merge into every environment,
            // and a leaked output writes client chunks over the ssr flavor files)
            const updatedRolldownOptions = updatedViteConfig.build!.rolldownOptions!;
            updatedRolldownOptions.input = undefined;
            const normalizedLibOutput = updatedRolldownOptions.output;
            const libraryFileName = viteConfig.build?.lib && viteConfig.build.lib.fileName;
            if (typeof libraryFileName === 'function') {
              const outputs = Array.isArray(normalizedLibOutput)
                ? normalizedLibOutput
                : [normalizedLibOutput];
              for (const output of outputs) {
                if (output) {
                  output.entryFileNames ??= (chunk) =>
                    libraryFileName(output.format === 'cjs' ? 'cjs' : 'es', chunk.name);
                }
              }
            }
            updatedRolldownOptions.output = undefined;
            updatedViteConfig.builder = {
              sharedConfigBuild: true,
              async buildApp(builder) {
                await builder.build(builder.environments.ssr);
                await builder.build(builder.environments.client);
              },
            };
            updatedViteConfig.environments = {
              ssr: {
                consumer: 'server',
                build: {
                  ssr: true,
                  rolldownOptions: { ...userRolldownOptions, output: normalizedLibOutput },
                },
              },
              client: {
                consumer: 'client',
                build: {
                  lib: false,
                  ssr: false,
                  outDir: viteConfig.build?.outDir,
                  emptyOutDir: false,
                  modulePreload: false,
                  target: viteConfig.build?.target,
                  minify: false,
                  copyPublicDir: false,
                  rolldownOptions: {
                    input: { index: clientLibEntry },
                    external: userRolldownOptions?.external,
                    output: {
                      format: 'es',
                      // segment chunks are emitted as entries to stay exporting chunks
                      entryFileNames: (chunk: { name: string }) =>
                        chunk.name === 'index' ? 'index.client.qwik.mjs' : 'chunks/[name].js',
                      chunkFileNames: 'chunks/[name].js',
                    },
                  },
                },
              },
            };
          }
        } else {
          // Test Build
          updatedViteConfig.define = {
            [qDevKey]: true,
            [qTestKey]: true,
            [qInspectorKey]: false,
          };
        }

        (globalThis as any).qDev = qDev;
        (globalThis as any).qTest = true;
        (globalThis as any).qInspector = qInspector;
      }

      return updatedViteConfig;
    },

    configEnvironment(name: string, _config: EnvironmentOptions, _env: ConfigEnv) {
      // Use environment name to distinguish server vs client — config.consumer is not yet set
      // at the time this hook is called. Adapters may add their own server environment (e.g. `ssg`
      // for static generation), which needs the same server treatment as `ssr`.
      const isServer = name === 'ssr' || name === 'ssg';
      if (isServer) {
        return {
          resolve: {
            noExternal: testResume.isResume()
              ? true
              : [QWIK_CORE_ID, QWIK_CORE_SERVER, QWIK_BUILD_ID],
          },
        } satisfies EnvironmentOptions;
      }
      // Client environment — only add 'min' conditions in production to avoid overriding
      // adapter-provided conditions (e.g. ['webworker', 'worker'] for edge adapters).
      if (buildMode === 'production') {
        return {
          resolve: {
            conditions: ['min'],
          },
        } satisfies EnvironmentOptions;
      }
      return {};
    },

    async configResolved(config) {
      qwikPlugin.setBuildConstants(readBuildConstants(config));
      basePathname = config.base;
      if (!(basePathname.startsWith('/') && basePathname.endsWith('/'))) {
        throw new Error(`vite's config.base must begin and end with /`);
      }
      const useSourcemap = !!config.build.sourcemap;
      if (useSourcemap && qwikViteOpts.optimizerOptions?.sourcemap === undefined) {
        qwikPlugin.setSourceMapSupport(true);
      }
      // Ensure that the final settings are applied
      // Use cachedPluginOpts if available to preserve clientOutDir
      if (cachedPluginOpts) {
        qwikPlugin.normalizeOptions(cachedPluginOpts);
      } else {
        qwikPlugin.normalizeOptions(qwikViteOpts);
      }

      // Vite's import-analysis-build plugin rewrites every dynamic import to go
      // through `__vitePreload`, producing an extra `preload-helper.js` chunk
      // and adding an import + wrapper to every QRL bundle. Qwik has its own
      // preloader, so the helper is pure overhead. `build.modulePreload: false`
      // does NOT disable this — see https://github.com/vitejs/vite/issues/18551.
      if (
        viteCommand === 'build' &&
        !qwikViteOpts.csr &&
        qwikPlugin.getOptions().target === 'client'
      ) {
        const names = ['vite:build-import-analysis', 'native:import-analysis-build'];
        const plugins = config.plugins as VitePlugin[];
        for (const name of names) {
          const i = plugins.findIndex((p) => p?.name === name);
          if (i >= 0) {
            plugins.splice(i, 1);
          }
        }
      }
    },

    async buildStart() {
      injections.length = 0;

      // Using vite.resolveId to check file if exist
      // for example input might be virtual file
      const resolver = this.resolve.bind(this);
      await qwikPlugin.validateSource(resolver);

      qwikPlugin.onDiagnostics((diagnostics, optimizer, srcDir) => {
        diagnostics.forEach((d) => {
          const id = qwikPlugin.normalizePath(optimizer.sys.path.join(srcDir, d.file));
          if (d.category === 'error') {
            this.error(createBundlerError(id, d));
          } else {
            this.warn(createBundlerError(id, d));
          }
        });
      });

      await qwikPlugin.buildStart(this);
      workerCoreChunkRef = undefined;
      if (viteCommand === 'build' && qwikPlugin.getOptions().target === 'client') {
        workerCoreChunkRef = emitQwikWorkerCoreChunk(this);
      }
    },

    resolveId(id, importer, resolveIdOpts) {
      if (isLinkedBuildId(id) || (importer !== undefined && isLinkedBuildId(importer))) {
        return qwikPlugin.resolveId(this, id, importer, resolveIdOpts);
      }
      if (testResume.getTestSource(id) !== undefined) {
        return id;
      }
      if (id.endsWith(QWIK_HMR_BRIDGE_ID)) {
        return QWIK_HMR_BRIDGE_ID;
      }
      if (isQwikWorkerCoreId(id)) {
        return QWIK_WORKER_CORE_ID;
      }
      const shouldResolveFile = fileFilter(id, 'resolveId');
      if (isVirtualId(id) || !shouldResolveFile) {
        return null;
      }
      return qwikPlugin.resolveId(this, id, importer, resolveIdOpts);
    },

    load(id, loadOpts) {
      if (isLinkedBuildId(id)) {
        return qwikPlugin.load(this, id, loadOpts);
      }
      const testSource = testResume.getTestSource(id);
      if (testSource !== undefined) {
        return { code: testSource };
      }
      if (id === QWIK_HMR_BRIDGE_ID) {
        return { code: QWIK_HMR_BRIDGE_CODE };
      }
      if (id === QWIK_WORKER_CORE_ID) {
        return loadQwikWorkerCore();
      }
      const shouldLoadFile = fileFilter(id, 'load');
      if (isVirtualId(id) || !shouldLoadFile) {
        return null;
      }

      id = qwikPlugin.normalizePath(id);

      if (viteCommand === 'serve' && id.endsWith(QWIK_CLIENT_MANIFEST_ID)) {
        return {
          code: 'export const manifest = undefined;',
        };
      }
      return qwikPlugin.load(this, id, loadOpts);
    },

    transform(code, id, transformOpts) {
      const testTarget = qwikPlugin.getOptions().testTarget;
      const testSource =
        testTarget === undefined ? undefined : testResume.prepareTestSource(code, id, testTarget);
      if (testSource !== undefined) {
        return { code: testSource };
      }
      if (
        id.includes('.vite/deps/') &&
        code.slice(0, 5000).includes('qwik') &&
        /import[^\n]*qwik[^\n]*\n/.test(code)
      ) {
        const relPath = rootDir && id.startsWith(rootDir) ? id.slice(rootDir.length) : id;
        throw new Error(
          `\n\n==============\n\n` +
            `⚠️ IMPORTANT: This dependency was pre-bundled by Vite, but it seems to use Qwik, which needs processing by the optimizer.\n\n` +
            `👉 Please add the original modulename to the "optimizeDeps.exclude" array in your Vite config\n` +
            `👉   ${relPath}\n\n` +
            `==============\n\n`
        );
      }
      const shouldTransformFile = fileFilter(id, 'transform');
      const isStringImportId = id.includes('?raw');
      if (isVirtualId(id) || !shouldTransformFile || isStringImportId) {
        return null;
      }

      return qwikPlugin.transform(this, code, id, transformOpts);
    },
  } as const satisfies VitePlugin<QwikVitePluginApi>;

  const vitePluginPost: VitePlugin<never> = {
    name: 'vite-plugin-qwik-post',
    enforce: 'post',

    generateBundle: {
      order: 'post',
      async handler(_, rollupBundle) {
        qwikPlugin.linkedBuild.generateBundle(this, rollupBundle);
        const isClient = this.environment.config.consumer === 'client';
        const isSSR = this.environment.config.consumer === 'server';

        if (isClient) {
          // client build
          const opts = qwikPlugin.getOptions();

          for (const [fileName, b] of Object.entries(rollupBundle)) {
            if (b.type === 'asset') {
              const baseFilename = basePathname + fileName;
              if (STYLING.some((ext) => fileName.endsWith(ext))) {
                if (typeof b.source === 'string' && b.source.length < opts.inlineStylesUpToBytes) {
                  injections.push({
                    tag: 'style',
                    location: 'head',
                    attributes: {
                      'data-src': baseFilename,
                      dangerouslySetInnerHTML: b.source,
                    },
                  });
                } else {
                  injections.push({
                    tag: 'link',
                    location: 'head',
                    attributes: {
                      rel: 'stylesheet',
                      href: baseFilename,
                    },
                  });
                }
              }
            }
          }

          const manifest = await qwikPlugin.generateManifest(
            this,
            rollupBundle,
            bundleGraphAdders,
            {
              injections,
              platform: { vite: '' },
            }
          );

          const resolveChunkPath = createBuildWorkerQrlChunkResolver(manifest, basePathname);
          for (const output of Object.values(rollupBundle)) {
            if (output.type === 'chunk') {
              output.code = rewriteWorkerQrlChunkPlaceholders(output.code, resolveChunkPath);
            }
          }
          rewriteClientWorkerCorePlaceholders(this, rollupBundle, workerCoreChunkRef);
        } else if (isSSR) {
          rewriteSsrWorkerCorePlaceholders(rollupBundle, qwikPlugin.getOptions().manifestInput);
        }
      },
    },

    async writeBundle(outputOptions, rollupBundle) {
      const opts = qwikPlugin.getOptions();
      const isSSR = this.environment.config.consumer === 'server';
      if (isSSR) {
        // ssr build

        const sys = qwikPlugin.getSys();
        if (sys.env === 'node' || sys.env === 'bun' || sys.env === 'deno') {
          const outputs = Object.keys(rollupBundle);

          // In order to simplify executing the server script with a common script
          // always ensure there's a plain .js file.
          // For example, if only a .mjs was generated, also
          // create the .js file that just calls the .mjs file
          const patchModuleFormat = async (bundeName: string) => {
            try {
              const bundleFileName = sys.path.basename(bundeName);
              const ext = sys.path.extname(bundleFileName);
              const isEntryFile =
                bundleFileName.startsWith('entry.') || bundleFileName.startsWith('entry_');
              if (
                isEntryFile &&
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

                  // Write next to this bundle's own output — other environments (e.g. the
                  // throwaway ssg build) must not clobber the deployed server entry.
                  const folder = sys.path.join(outputOptions.dir || opts.outDir, bundleOutDir);
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
    transformIndexHtml() {
      // only in dev mode
      if (viteCommand !== 'serve') {
        return;
      }
      return getViteIndexTags(qwikPlugin.getOptions(), basePathname);
    },
    configureServer(server: ViteDevServer) {
      viteServer = server;
      qwikPlugin.configureServer(server);
      const imageDevTools = qwikViteOpts?.devTools?.imageDevTools ?? true;

      if (imageDevTools) {
        server.middlewares.use(getImageSizeServer(qwikPlugin.getSys(), rootDir!, srcDir!));
      }
    },

    configurePreviewServer(server) {
      return async () => {
        const sys = qwikPlugin.getSys();
        const path = qwikPlugin.getPath();
        await configurePreviewServer(server.middlewares, ssrOutDir!, sys, path);
      };
    },

    hotUpdate(ctx) {
      qwikPlugin.hotUpdate(this.environment, ctx);

      const hmrEnabled = qwikViteOpts?.devTools?.hmr ?? true;
      if (this.environment.name === 'ssr' && ctx.modules.length) {
        if (hmrEnabled) {
          // Source files live in the SSR module graph. When they change, notify the
          // client's loaded QRL segments via the client environment's HMR channel.
          // Some non-source imports (e.g. .css?inline) are type 'js' but their URL
          // is not a JS/TS file. For those, emit their JS importers instead, since
          // the component that needs to re-render is the importer.
          const files = new Set<string>();
          const isSourceUrl = (url: string) => /\.([mc]?[jt]sx?|mdx?)$/.test(url.split('?')[0]);
          for (const m of ctx.modules) {
            const url = m.url.split('?')[0];
            if (m.type === 'js' && isSourceUrl(m.url)) {
              files.add(url);
            } else {
              for (const importer of m.importers) {
                if (importer.type === 'js' && isSourceUrl(importer.url)) {
                  files.add(importer.url.split('?')[0]);
                }
              }
            }
          }
          if (files.size > 0 && viteServer) {
            viteServer.environments.client.hot.send({
              type: 'custom',
              event: 'qwik:hmr',
              data: { files: [...files], t: ctx.timestamp },
            });
          }
        } else {
          viteServer?.environments.client.hot.send({ type: 'full-reload' });
        }
      }
    },

    onLog(level, log) {
      if (log.plugin == ('vite-plugin-qwik' satisfies QwikVitePlugin['name'])) {
        const color = LOG_COLOR[level] || ANSI_COLOR.White;
        const frames = (log.frame || '')
          .split('\n')
          .map(
            (line) =>
              (line.match(/^\s*\^\s*$/) ? ANSI_COLOR.BrightWhite : ANSI_COLOR.BrightBlack) + line
          );
        // eslint-disable-next-line no-console
        console[level](
          `${color}%s\n${ANSI_COLOR.BrightWhite}%s\n%s${ANSI_COLOR.RESET}`,
          `[${log.plugin}](${level}): ${log.message}\n`,
          `  ${log?.loc?.file}:${log?.loc?.line}:${log?.loc?.column}\n`,
          `  ${frames.join('\n  ')}\n`
        );
        return false;
      }
    },
  } as const satisfies VitePlugin<QwikVitePluginApi>;

  return [vitePluginPre, vitePluginPost, checkExternals()];
}

/**
 * Qwik libraries ship pre-built `.qwik.mjs` code, so a production server build handles them like
 * any other dependency: Vite's defaults and the user's config decide what is external, and core and
 * the router share their runtime state with the copies an external library loads. The build warns
 * when the production server could not load an external library from node_modules.
 *
 * The dev server and non-production builds bundle every Qwik library: their server bundle carries
 * the development core, which cannot share state with the production core Node loads for an
 * external library, and the dev server's SSR also needs the segment URLs of the library's QRLs.
 *
 * On the client every Qwik library is excluded from dep optimization, so the optimizer can split
 * its QRLs into segments.
 */
type PackageJson = {
  version?: string;
  qwik?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
type InstalledPackage = { dir: string; json: PackageJson };

async function checkExternals() {
  let fs: typeof import('fs').promises;
  let path: typeof import('path');
  let loaded = false;

  async function loadModules() {
    if (loaded) {
      return true;
    }
    try {
      fs = await import('node:fs').then((m) => m.promises);
      path = await import('node:path');
      loaded = true;
      return true;
    } catch {
      return false;
    }
  }

  const seen: Set<string> = new Set();
  /** Qwik libraries that must stay in the server bundle. */
  const bundledDeps: string[] = [];
  /** Dependencies that production installs may leave out. */
  let devOnlyDeps = new Set<string>();
  /** Whether the server bundle carries the production core, the build Node loads for externals. */
  let bundlesProductionCore = false;
  let rootDir: string;
  const core2 = '@qwik.dev/core';
  const core1 = '@builder.io/qwik';
  const qwikRouter = '@qwik.dev/router';
  /** The project's dependencies, and those it only installs as devDependencies. */
  async function getInstalledDependencies(root: string) {
    // Walk up from `root` and union deps from every package.json we find, so
    // monorepo setups where Vite's root points at a sub-project still pick up
    // workspace-root deps (e.g. an Nx lib whose deps are declared at the
    // repo root).
    //
    const runtimeDeps = new Set<string>();
    const devDeps = new Set<string>();
    let dir = root;
    while (dir) {
      try {
        const pkgPath = path.join(dir, 'package.json');
        const data = await fs.readFile(pkgPath, { encoding: 'utf-8' });
        const json = JSON.parse(data);
        for (const name of Object.keys(json.dependencies || {})) {
          runtimeDeps.add(name);
        }
        for (const name of Object.keys(json.devDependencies || {})) {
          devDeps.add(name);
        }
        for (const name of Object.keys(json.optionalDependencies || {})) {
          runtimeDeps.add(name);
        }
      } catch {
        // No package.json at this level, or unreadable — keep walking.
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
    return {
      all: [...new Set([...runtimeDeps, ...devDeps])],
      devOnly: new Set([...devDeps].filter((name) => !runtimeDeps.has(name))),
    };
  }

  /** Finds the package.json that Node resolves for `dep` from `dir`. */
  async function readInstalledPackage(dep: string, dir: string) {
    while (dir) {
      const pkgDir = path.join(dir, 'node_modules', dep);
      try {
        const data = await fs.readFile(path.join(pkgDir, 'package.json'), { encoding: 'utf-8' });
        return { dir: pkgDir, json: JSON.parse(data) as PackageJson };
      } catch {
        //empty
      }
      const nextRoot = path.dirname(dir);
      if (nextRoot === dir) {
        break;
      }
      dir = nextRoot;
    }
    return undefined;
  }

  // any mention of lowercase qwik in the package.json is enough
  const isQwikPackage = (json: PackageJson) =>
    !!(
      json.qwik ||
      json.dependencies?.[core2] ||
      json.peerDependencies?.[core2] ||
      json.devDependencies?.[core2] ||
      json.dependencies?.[core1] ||
      json.peerDependencies?.[core1] ||
      json.devDependencies?.[core1]
    );

  async function isQwikDep(dep: string, dir: string) {
    const installed = await readInstalledPackage(dep, dir);
    return !!installed && isQwikPackage(installed.json);
  }

  const dependsOn = (json: PackageJson, dep: string) =>
    !!(json.dependencies?.[dep] || json.peerDependencies?.[dep]);
  const mentions = (json: PackageJson, dep: string) =>
    dependsOn(json, dep) || !!json.devDependencies?.[dep];

  /** What would break when the production server loads `name` from node_modules. */
  async function findExternalLibraryProblems(
    name: string,
    library: InstalledPackage,
    environmentName: string
  ) {
    const bundleIt = `or add "${name}" to "resolve.noExternal[]" to bundle it.`;
    if (mentions(library.json, core1) && !mentions(library.json, core2)) {
      return [
        `${name} is built with Qwik 1 and cannot stay external; add it to "resolve.noExternal[]".`,
      ];
    }
    const problems: string[] = [];
    const runtimeImports = [name, core2];
    if (dependsOn(library.json, qwikRouter)) {
      runtimeImports.push(qwikRouter);
    }
    const devOnly = runtimeImports.filter((dep) => devOnlyDeps.has(dep));
    // Static site generation runs during the build, where devDependencies are installed.
    if (devOnly.length > 0 && environmentName !== 'ssg') {
      problems.push(
        `${name} stays external, so the server imports ${devOnly.join(', ')} at runtime, but the project lists them only in "devDependencies", which a production install such as "npm install --omit=dev" leaves out. Move them to "dependencies", ${bundleIt}`
      );
    }
    // Node resolves the library's imports from its real path, e.g. inside pnpm's store.
    const libraryDir = await fs.realpath(library.dir).catch(() => library.dir);
    const libraryCore = await readInstalledPackage(core2, libraryDir);
    const appCore = await readInstalledPackage(core2, rootDir);
    if (libraryCore && appCore && libraryCore.json.version !== appCore.json.version) {
      problems.push(
        `${name} stays external and resolves ${core2} ${libraryCore.json.version}, while the app uses ${appCore.json.version}. The server refuses to load two Qwik versions (Q30); align the versions, ${bundleIt}`
      );
    }
    return problems;
  }

  return {
    name: 'checkQwikExternals',
    enforce: 'pre',
    configResolved: (config) => {
      rootDir = config.root;
    },
    // Attempt to mark the Qwik dependencies as non-optimizeable
    config: {
      order: 'post',
      async handler(config, env) {
        if (!(await loadModules())) {
          return;
        }
        // Vite sets NODE_ENV before the config hooks, and resolves the production core only then.
        bundlesProductionCore = env?.command === 'build' && process.env.NODE_ENV === 'production';
        const root = config.root || process.cwd();
        const optimizeDepsExclude = config.optimizeDeps?.exclude ?? [];

        /**
         * Find Qwik libraries in the project's dependencies and exclude them from dep optimization
         * so the Qwik plugin can transform their $() calls.
         */
        const installed = await getInstalledDependencies(root);
        devOnlyDeps = installed.devOnly;
        const qwikDeps: string[] = [];
        bundledDeps.length = 0;
        for (const dep of installed.all) {
          if (await isQwikDep(dep, root)) {
            qwikDeps.push(dep);
            if (!bundlesProductionCore) {
              bundledDeps.push(dep);
            }
          }
        }
        const toExclude = qwikDeps.filter((dep) => !optimizeDepsExclude.includes(dep));
        return {
          optimizeDeps: { exclude: toExclude },
          ssr: { noExternal: [...bundledDeps] },
        };
      },
    },
    // bundled qwik deps need to be marked as noExternal per-environment
    configEnvironment(_name: string, options: Record<string, any>) {
      if (bundledDeps.length === 0) {
        return;
      }
      const existing = options.resolve?.noExternal;
      if (existing === true) {
        return;
      }
      let currentList: (string | RegExp)[];
      if (Array.isArray(existing)) {
        currentList = existing;
      } else if (existing) {
        currentList = [existing];
      } else {
        currentList = [];
      }
      return {
        resolve: { noExternal: [...currentList, ...bundledDeps] },
      };
    },
    // An external Qwik dep breaks outside production builds, and may break a production server
    resolveId: {
      order: 'pre',
      async handler(source, importer, options) {
        if (!(await loadModules())) {
          return;
        }
        const isSSR = this.environment.config.consumer === 'server';
        // Server environments externalize differently, e.g. an adapter's `ssg` next to `ssr`.
        const seenKey = (id: string) => `${this.environment.name}:${id}`;
        if (!isSSR || /^([./]|node:|[^a-z@])/i.test(source) || seen.has(seenKey(source))) {
          return;
        }
        const packageName = (
          source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0]
        ).split('?')[0];
        if (seen.has(seenKey(packageName))) {
          return;
        }
        // technically we should check for each importer, but this is ok
        seen.add(seenKey(source));
        seen.add(seenKey(packageName));
        let result: Awaited<ReturnType<Extract<VitePlugin['resolveId'], Function>>>;
        try {
          result = await this.resolve(packageName, importer, { ...options, skipSelf: true });
        } catch {
          /* ignore, let vite figure it out */
          return;
        }
        if (result?.external) {
          const dir = importer ? path.dirname(importer) : rootDir;
          const library = await readInstalledPackage(packageName, dir);
          if (library && isQwikPackage(library.json)) {
            if (!bundlesProductionCore) {
              // TODO link to docs
              throw new Error(
                `\n==============\n` +
                  `${packageName} is a Qwik library that is being treated as an external dependency, but development servers and builds need it bundled.\n` +
                  `Please add the package to "resolve.noExternal[]" as well as "optimizeDeps.exclude[]" in the Vite config. \n` +
                  `==============\n`
              );
            }
            for (const problem of await findExternalLibraryProblems(
              packageName,
              library,
              this.environment.name
            )) {
              this.warn(problem);
            }
          }
        }
        if (packageName === source) {
          // We already resolved it, so return that result
          return result;
        }
      },
    },
  } as const satisfies VitePlugin<never>;
}

const ANSI_COLOR = {
  Black: '\x1b[30m',
  Red: '\x1b[31m',
  Green: '\x1b[32m',
  Yellow: '\x1b[33m',
  Blue: '\x1b[34m',
  Magenta: '\x1b[35m',
  Cyan: '\x1b[36m',
  White: '\x1b[37m',
  BrightBlack: '\x1b[90m',
  BrightRed: '\x1b[91m',
  BrightGreen: '\x1b[92m',
  BrightYellow: '\x1b[93m',
  BrightBlue: '\x1b[94m',
  BrightMagenta: '\x1b[95m',
  BrightCyan: '\x1b[96m',
  BrightWhite: '\x1b[97m',
  RESET: '\x1b[0m',
};

const LOG_COLOR = {
  warn: ANSI_COLOR.Yellow,
  info: ANSI_COLOR.Cyan,
  debug: ANSI_COLOR.BrightBlack,
};

export const isNotNullable = <T>(v: T): v is NonNullable<T> => {
  return v != null;
};

interface QwikVitePluginCommonOptions {
  /** Selects CSR, resume, or SSR compilation in test runners. Defaults to SSR. */
  testTarget?: 'csr' | 'resume' | 'ssr';
  /**
   * Prints verbose Qwik plugin debug logs.
   *
   * Default `false`
   */
  debug?: boolean;
  /**
   * The Qwik entry strategy to use while building for production. During development the type is
   * always `segment`.
   *
   * Default `{ type: "smart" }`)
   */
  entryStrategy?: EntryStrategy;
  /**
   * The source directory to find all the Qwik components. Since Qwik does not have a single input,
   * the `srcDir` is used to recursively find Qwik files.
   *
   * Default `src`
   */
  srcDir?: string;
  /**
   * List of tsconfig.json files to use for ESLint warnings during development.
   *
   * Default `['tsconfig.json']`
   */
  tsconfigFileNames?: string[];
  /**
   * List of directories to recursively search for Qwik components or Vendors.
   *
   * Default `[]`
   *
   * @deprecated No longer used. Instead, any imported file with `.qwik.` in the name is processed.
   */
  vendorRoots?: string[];
  /**
   * Disables the automatic vendor roots scan. This is useful when you want to manually specify the
   * vendor roots.
   */
  disableVendorScan?: boolean;
  /**
   * Options for the Qwik optimizer.
   *
   * Default `undefined`
   */
  optimizerOptions?: OptimizerOptions;
  /**
   * Hook that's called after the build and provides all of the transformed modules that were used
   * before bundling.
   */
  transformedModuleOutput?:
    | ((transformedModules: TransformModule[]) => Promise<void> | void)
    | null;
  devTools?: QwikPluginDevTools;
  /**
   * Predicate function to filter out files from the optimizer. hook for resolveId, load, and
   * transform
   */
  fileFilter?: (id: string, hook: keyof VitePlugin) => boolean;
  /**
   * Run eslint on the source files for the ssr build or dev server. This can slow down startup on
   * large projects. Defaults to `true`
   */
  lint?: boolean;
  /**
   * Experimental features. These can come and go in patch releases, and their API is not guaranteed
   * to be stable between releases
   */
  experimental?: (keyof typeof ExperimentalFeatures)[];

  /** @deprecated No longer used. Automatic font preloading has been removed. */
  disableFontPreload?: boolean;
}

interface QwikVitePluginCSROptions extends QwikVitePluginCommonOptions {
  /** Client Side Rendering (CSR) mode. It will not support SSR, default to Vite's `index.html` file. */
  csr: true;
  client?: never;
  devSsrServer?: never;
  ssr?: never;
}

interface QwikVitePluginSSROptions extends QwikVitePluginCommonOptions {
  /** Client Side Rendering (CSR) mode. It will not support SSR, default to Vite's `index.html` file. */
  csr?: false | undefined;
  client?: {
    /**
     * The entry point for the client builds. This would be the application's root component
     * typically.
     *
     * Default `src/components/app/app.tsx`
     */
    input?: string[] | string;
    /**
     * Output directory for the client build.
     *
     * Default `dist`
     */
    outDir?: string;
    /**
     * The client build will create a manifest and this hook is called with the generated build
     * data.
     *
     * Default `undefined`
     */
    manifestOutput?: (manifest: QwikManifest) => Promise<void> | void;
  };

  /** @deprecated Use the `devSsrServer` option of the qwikRouter() plugin instead. */
  devSsrServer?: boolean;

  /** Controls the SSR behavior. */
  ssr?: {
    /**
     * The entry point for the SSR renderer. This file should export a `render()` function. This
     * entry point and `render()` export function is also used for Vite's SSR development and
     * Node.js debug mode.
     *
     * Default `src/entry.ssr.tsx`
     */
    input?: string;
    /**
     * Output directory for the server build.
     *
     * Default `server`
     */
    outDir?: string;
    /**
     * The SSR build requires the manifest generated during the client build. By default, this
     * plugin will wire the client manifest to the ssr build. However, the `manifestInput` option
     * can be used to manually provide a manifest.
     *
     * Default `undefined`
     */
    manifestInput?: QwikManifest;
    /** Same as `manifestInput` but allows passing the path to the file. */
    manifestInputPath?: string;
  };
}

interface QwikVitePluginCSROptions extends QwikVitePluginCommonOptions {
  /** Client Side Rendering (CSR) mode. It will not support SSR, default to Vite's `index.html` file. */
  csr: true;
}

/** @public */
export type QwikVitePluginOptions = QwikVitePluginCSROptions | QwikVitePluginSSROptions;
export { ExperimentalFeatures } from './plugin';

/** @public */
export type SegmentCallback = (parentId: string, segment: SegmentAnalysis) => void;

/** @public */
export interface QwikVitePluginApi {
  getOptimizer: () => Optimizer | null;
  getOptions: () => NormalizedQwikPluginOptions;
  getManifest: () => QwikManifest | null;
  getRootDir: () => string | null;
  getClientOutDir: () => string | null;
  getClientPublicOutDir: () => string | null;
  registerBundleGraphAdder: (adder: BundleGraphAdder) => void;
  /** Register a callback that fires for each segment emitted during transform. */
  onSegment: (callback: SegmentCallback) => void;
  /** @internal */
  _oldDevSsrServer: () => boolean | undefined;
}

/**
 * This is the type of the "pre" Qwik Vite plugin. `qwikVite` actually returns a tuple of two
 * plugins, but after Vite flattens them, you can find the plugin by name.
 *
 * @public
 */
export type QwikVitePlugin = P<QwikVitePluginApi> & {
  name: 'vite-plugin-qwik';
};

/**
 * The boolean build flags the host defined, from vite's resolved env and `define`. Only a real
 * boolean counts: a `.env` string stays a string, and guessing at one would decide a branch wrong.
 */
export function readBuildConstants(config: {
  env?: Record<string, unknown>;
  define?: Record<string, unknown>;
}): Record<string, boolean> {
  const constants: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(config.env ?? {})) {
    if (typeof value === 'boolean') {
      constants[key] = value;
    }
  }
  for (const [key, value] of Object.entries(config.define ?? {})) {
    if (value === 'true' || value === 'false') {
      constants[key.replace(/^import\.meta\.env\./, '')] = value === 'true';
    }
  }
  return constants;
}
