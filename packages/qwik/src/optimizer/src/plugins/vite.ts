import type { UserConfig, ViteDevServer, Plugin as VitePlugin, BuildOptions } from 'vite';
import type {
  EntryStrategy,
  GlobalInjections,
  Optimizer,
  OptimizerOptions,
  QwikManifest,
  TransformModule,
} from '../types';
import { type BundleGraphAdder } from './bundle-graph';
import { getImageSizeServer } from './dev/image-size-server';
import {
  QWIK_BUILD_ID,
  QWIK_CLIENT_MANIFEST_ID,
  QWIK_CORE_ID,
  QWIK_CORE_INTERNAL_ID,
  QWIK_CORE_SERVER,
  QWIK_JSX_DEV_RUNTIME_ID,
  QWIK_JSX_RUNTIME_ID,
  TRANSFORM_REGEX,
  createQwikPlugin,
  type ExperimentalFeatures,
  type NormalizedQwikPluginOptions,
  type QwikBuildMode,
  type QwikBuildTarget,
  type QwikPluginOptions,
} from './plugin';
import { createRollupError, normalizeRollupOutputOptions } from './rollup';
import { configurePreviewServer, getViteIndexTags } from './dev';
import { isVirtualId } from './vite-utils';
import type { ResolvedId } from 'rollup';

const DEDUPE = [
  QWIK_CORE_ID,
  QWIK_JSX_RUNTIME_ID,
  QWIK_JSX_DEV_RUNTIME_ID,
  QWIK_CORE_INTERNAL_ID,
  '@builder.io/qwik',
  '@builder.io/qwik/jsx-runtime',
  '@builder.io/qwik/jsx-dev-runtime',
];

const STYLING = ['.css', '.scss', '.sass', '.less', '.styl', '.stylus'];
const FONTS = ['.woff', '.woff2', '.ttf'];

/**
 * Workaround to make the api be defined in the type.
 *
 * @internal
 */
type P<T> = VitePlugin<T> & { api: T; config: Extract<VitePlugin<T>['config'], Function> };

/**
 * The types for Vite/Rollup don't allow us to be too specific about the return type. The correct
 * return type is `[QwikVitePlugin, VitePlugin<never>]`, and if you search the plugin by name you'll
 * get the `QwikVitePlugin`.
 *
 * @public
 */
export function qwikVite(qwikViteOpts: QwikVitePluginOptions = {}): any {
  let viteCommand: 'build' | 'serve' = 'serve';
  let manifestInput: QwikManifest | null = null;
  let clientOutDir: string | null = null;
  let basePathname: string = '/';
  let clientPublicOutDir: string | null = null;
  let viteAssetsDir: string | undefined;
  let srcDir: string | null = null;
  let rootDir: string | null = null;

  let ssrOutDir: string | null = null;
  // Cache the user-specified clientOutDir to use across multiple normalizeOptions calls
  const userClientOutDir = qwikViteOpts.client?.outDir;
  // Cache the resolved plugin options from config() to reuse in configResolved()
  let cachedPluginOpts: QwikPluginOptions | null = null;
  const fileFilter: QwikVitePluginOptions['fileFilter'] = qwikViteOpts.fileFilter
    ? (id, type) => TRANSFORM_REGEX.test(id) || qwikViteOpts.fileFilter!(id, type)
    : () => true;
  const disableFontPreload = qwikViteOpts.disableFontPreload ?? false;
  const injections: GlobalInjections[] = [];
  const qwikPlugin = createQwikPlugin(qwikViteOpts.optimizerOptions);

  const bundleGraphAdders = new Set<BundleGraphAdder>();

  const api: QwikVitePluginApi = {
    getOptimizer: () => qwikPlugin.getOptimizer(),
    getOptions: () => qwikPlugin.getOptions(),
    getManifest: () => manifestInput,
    getRootDir: () => qwikPlugin.getOptions().rootDir,
    getClientOutDir: () => clientOutDir,
    getClientPublicOutDir: () => clientPublicOutDir,
    getAssetsDir: () => viteAssetsDir,
    registerBundleGraphAdder: (adder: BundleGraphAdder) => bundleGraphAdders.add(adder),
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

      const path = qwikPlugin.getPath();

      let target: QwikBuildTarget;
      if (viteConfig.build?.ssr || viteEnv.mode === 'ssr') {
        target = 'ssr';
      } else if (viteEnv.mode === 'lib') {
        target = 'lib';
      } else if (viteEnv.mode === 'test') {
        target = 'test';
      } else {
        target = 'client';
      }

      viteCommand = viteEnv.command;

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
      let input = viteConfig.build?.rollupOptions?.input || clientInput || ssrInput;
      if (input && typeof input === 'string') {
        input = [input];
      }
      viteAssetsDir = viteConfig.build?.assetsDir;
      const useAssetsDir = target === 'client' && !!viteAssetsDir && viteAssetsDir !== '_astro';
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
        assetsDir: useAssetsDir ? viteAssetsDir : undefined,
        devTools: qwikViteOpts.devTools,
        sourcemap: !!viteConfig.build?.sourcemap,
        lint: qwikViteOpts.lint,
        experimental: qwikViteOpts.experimental,
        input,
        manifestInput: qwikViteOpts.ssr?.manifestInput,
        manifestInputPath: qwikViteOpts.ssr?.manifestInputPath,
        manifestOutput: qwikViteOpts.client?.manifestOutput,
      };

      const opts = await qwikPlugin.normalizeOptions(pluginOpts);
      input ||= opts.input;

      // Cache pluginOpts for use in configResolved()
      cachedPluginOpts = pluginOpts;

      manifestInput = opts.manifestInput;
      srcDir = opts.srcDir;
      rootDir = opts.rootDir;

      if (!qwikViteOpts.csr) {
        clientOutDir = opts.clientOutDir;

        clientPublicOutDir = viteConfig.base
          ? path.join(clientOutDir, viteConfig.base)
          : clientOutDir;

        ssrOutDir = opts.ssrOutDir;
      }

      const isDevelopment = buildMode === 'development';
      const qDevKey = 'globalThis.qDev';
      const qTestKey = 'globalThis.qTest';
      const qInspectorKey = 'globalThis.qInspector';
      const qSerializeKey = 'globalThis.qSerialize';
      const qDev = viteConfig?.define?.[qDevKey] ?? isDevelopment;
      const qInspector = viteConfig?.define?.[qInspectorKey] ?? isDevelopment;
      const qSerialize = viteConfig?.define?.[qSerializeKey] ?? isDevelopment;

      const updatedViteConfig: UserConfig = {
        ssr: {
          noExternal: [QWIK_CORE_ID, QWIK_CORE_INTERNAL_ID, QWIK_CORE_SERVER, QWIK_BUILD_ID],
        },
        envPrefix: ['VITE_', 'PUBLIC_'],
        resolve: {
          dedupe: [...DEDUPE],
          conditions: buildMode === 'production' && target === 'client' ? ['min'] : [],
          alias: {
            '@builder.io/qwik': '@qwik.dev/core',
            '@builder.io/qwik/build': '@qwik.dev/core/build',
            '@builder.io/qwik/server': '@qwik.dev/core/server',
            '@builder.io/qwik/preloader': '@qwik.dev/core/preloader',
            '@builder.io/qwik/jsx-runtime': '@qwik.dev/core/jsx-runtime',
            '@builder.io/qwik/jsx-dev-runtime': '@qwik.dev/core/jsx-dev-runtime',
            '@builder.io/qwik/optimizer': '@qwik.dev/core/optimizer',
            '@builder.io/qwik/loader': '@qwik.dev/core/loader',
            '@builder.io/qwik/backpatch': '@qwik.dev/core/backpatch',
            '@builder.io/qwik/cli': '@qwik.dev/core/cli',
            '@builder.io/qwik/testing': '@qwik.dev/core/testing',
          },
        },
        esbuild:
          viteCommand === 'serve'
            ? false
            : {
                logLevel: 'error',
                jsx: 'automatic',
              },
        optimizeDeps: {
          exclude: [
            // using optimized deps for qwik libraries will lead to duplicate imports
            // this breaks Qwik because it relies a lot on module scoped symbols
            QWIK_CORE_ID,
            QWIK_CORE_INTERNAL_ID,
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
          rollupOptions: {
            external: ['node:async_hooks'],
            /**
             * This is a workaround to have predictable chunk hashes between builds. It doesn't seem
             * to impact the build time.
             * https://github.com/QwikDev/qwik/issues/7226#issuecomment-2647122505
             */
            maxParallelFileOps: 1,
            // This will amend the existing input
            input,
            // temporary fix for rolldown-vite types
          } as BuildOptions['rollupOptions'],
        },
        define: {
          [qDevKey]: qDev,
          [qInspectorKey]: qInspector,
          [qSerializeKey]: qSerialize,
          [qTestKey]: JSON.stringify(process.env.NODE_ENV === 'test'),
        },
      };

      if (!qwikViteOpts.csr) {
        updatedViteConfig.build!.cssCodeSplit = false;
        if (opts.outDir) {
          updatedViteConfig.build!.outDir = opts.outDir;
        }
        const origOnwarn = updatedViteConfig.build!.rollupOptions?.onwarn;
        updatedViteConfig.build!.rollupOptions = {
          ...updatedViteConfig.build!.rollupOptions,
          output: await normalizeRollupOutputOptions(
            qwikPlugin,
            viteConfig.build?.rollupOptions?.output,
            useAssetsDir,
            opts.outDir
          ),
          preserveEntrySignatures: 'exports-only',
          onwarn: (warning, warn) => {
            if (warning.plugin === 'typescript' && warning.message.includes('outputToFilesystem')) {
              return;
            }
            origOnwarn ? origOnwarn(warning, warn) : warn(warning);
          },
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
          updatedViteConfig.build!.rollupOptions.external = [
            QWIK_CORE_ID,
            QWIK_CORE_INTERNAL_ID,
            QWIK_CORE_SERVER,
            QWIK_JSX_RUNTIME_ID,
            QWIK_JSX_DEV_RUNTIME_ID,
            QWIK_BUILD_ID,
            QWIK_CLIENT_MANIFEST_ID,
          ];
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

    async configResolved(config) {
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
            this.error(createRollupError(id, d));
          } else {
            this.warn(createRollupError(id, d));
          }
        });
      });

      await qwikPlugin.buildStart(this);
    },

    resolveId(id, importer, resolveIdOpts) {
      const shouldResolveFile = fileFilter(id, 'resolveId');
      if (isVirtualId(id) || !shouldResolveFile) {
        return null;
      }
      return qwikPlugin.resolveId(this, id, importer, resolveIdOpts);
    },

    load(id, loadOpts) {
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
        const opts = qwikPlugin.getOptions();

        if (opts.target === 'client') {
          // client build

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
              } else {
                const selectedFont = FONTS.find((ext) => fileName.endsWith(ext));
                if (selectedFont && !disableFontPreload) {
                  injections.unshift({
                    tag: 'link',
                    location: 'head',
                    attributes: {
                      rel: 'preload',
                      href: baseFilename,
                      as: 'font',
                      type: `font/${selectedFont.slice(1)}`,
                      crossorigin: '',
                    },
                  });
                }
              }
            }
          }

          await qwikPlugin.generateManifest(this, rollupBundle, bundleGraphAdders, {
            injections,
            platform: { vite: '' },
          });
        }
      },
    },

    async writeBundle(_, rollupBundle) {
      const opts = qwikPlugin.getOptions();
      if (opts.target === 'ssr') {
        // ssr build

        const sys = qwikPlugin.getSys();
        if (sys.env === 'node' || sys.env === 'bun') {
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
    transformIndexHtml() {
      // only in dev mode
      if (viteCommand !== 'serve') {
        return;
      }
      return getViteIndexTags(qwikPlugin.getOptions(), srcDir!);
    },
    configureServer(server: ViteDevServer) {
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

    handleHotUpdate(ctx) {
      qwikPlugin.handleHotUpdate(ctx);

      // Tell the client to reload the page if any modules were used in ssr or client
      // this needs to be refined
      if (ctx.modules.length) {
        ctx.server.hot.send({
          type: 'full-reload',
        });
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
 * This plugin checks for external dependencies that should be included in the server bundle,
 * because they use Qwik. If they are not included, the optimizer won't process them, and there will
 * be two instances of Qwik Core loaded.
 */
async function checkExternals() {
  let fs: typeof import('fs').promises;
  let path: typeof import('path');
  try {
    fs = await import('node:fs').then((m) => m.promises);
    path = await import('node:path');
  } catch {
    // We can't do anything if we can't import fs and path
    return;
  }
  const seen: Set<string> = new Set();
  let rootDir: string;
  const core2 = '@qwik-dev/core';
  const core1 = '@builder.io/qwik';
  async function isQwikDep(dep: string, dir: string) {
    while (dir) {
      const pkg = path.join(dir, 'node_modules', dep, 'package.json');
      try {
        await fs.access(pkg);
        const data = await fs.readFile(pkg, {
          encoding: 'utf-8',
        });
        // any mention of lowercase qwik in the package.json is enough
        const json = JSON.parse(data);
        if (
          json.qwik ||
          json.dependencies?.[core2] ||
          json.peerDependencies?.[core2] ||
          json.dependencies?.[core1] ||
          json.peerDependencies?.[core1]
        ) {
          return true;
        }
        return false;
      } catch {
        //empty
      }
      const nextRoot = path.dirname(dir);
      if (nextRoot === dir) {
        break;
      }
      dir = nextRoot;
    }
    return false;
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
      async handler(config) {
        const toExclude = [];
        const externals = [config.ssr?.noExternal, config.environments?.ssr?.resolve?.noExternal]
          .flat()
          .filter((t) => typeof t === 'string');
        const optimizeDepsExclude = config.optimizeDeps?.exclude ?? [];
        for (const dep of externals) {
          if (!optimizeDepsExclude.includes(dep)) {
            if (await isQwikDep(dep, config.root || process.cwd())) {
              toExclude.push(dep);
            }
          }
        }
        return { optimizeDeps: { exclude: toExclude } };
      },
    },
    // We check all SSR build lookups for external Qwik deps
    resolveId: {
      order: 'pre',
      async handler(source, importer, options) {
        if (!options.ssr || /^([./]|node:|[^a-z@])/i.test(source) || seen.has(source)) {
          return;
        }
        const packageName = (
          source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0]
        ).split('?')[0];
        if (seen.has(packageName)) {
          return;
        }
        // technically we should check for each importer, but this is ok
        seen.add(source);
        seen.add(packageName);
        let result: ResolvedId | null;
        try {
          result = await this.resolve(packageName, importer, { ...options, skipSelf: true });
        } catch {
          /* ignore, let vite figure it out */
          return;
        }
        if (result?.external) {
          // Qwik deps should not be external
          if (await isQwikDep(packageName, importer ? path.dirname(importer) : rootDir)) {
            // TODO link to docs
            throw new Error(
              `\n==============\n` +
                `${packageName} is being treated as an external dependency, but it should be included in the server bundle, because it uses Qwik and it needs to be processed by the optimizer.\n` +
                `Please add the package to "ssr.noExternal[]" as well as "optimizeDeps.exclude[]" in the Vite config. \n` +
                `==============\n`
            );
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
  devTools?: {
    /**
     * Validates image sizes for CLS issues during development. In case of issues, provides you with
     * a correct image size resolutions. If set to `false`, image dev tool will be disabled.
     *
     * Default `true`
     */
    imageDevTools?: boolean | true;
    /**
     * Press-hold the defined keys to enable qwik dev inspector. By default the behavior is
     * activated by pressing the left or right `Alt` key. If set to `false`, qwik dev inspector will
     * be disabled.
     *
     * Valid values are `KeyboardEvent.code` values. Please note that the 'Left' and 'Right'
     * suffixes are ignored.
     */
    clickToSource?: string[] | false;
  };
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

  /**
   * Disables automatic preloading of font assets (WOFF/WOFF2/TTF) found in the build output. When
   * enabled, the plugin will not add `<link rel="preload">` tags for font files in the document
   * head.
   *
   * Disabling may impact Cumulative Layout Shift (CLS) metrics.
   */
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
export interface QwikVitePluginApi {
  getOptimizer: () => Optimizer | null;
  getOptions: () => NormalizedQwikPluginOptions;
  getManifest: () => QwikManifest | null;
  getRootDir: () => string | null;
  getClientOutDir: () => string | null;
  getClientPublicOutDir: () => string | null;
  getAssetsDir: () => string | undefined;
  registerBundleGraphAdder: (adder: BundleGraphAdder) => void;
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
