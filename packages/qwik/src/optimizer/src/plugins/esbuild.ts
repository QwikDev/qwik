import type { Plugin, PluginBuild } from 'esbuild';
import type {
  EntryStrategy,
  Optimizer,
  OptimizerOptions,
  QwikManifest,
  TransformModule,
  TransformModuleInput,
} from '../types';
import {
  createQwikPlugin,
  type ExperimentalFeatures,
  type NormalizedQwikPluginOptions,
  type QwikBuildMode,
  type QwikBuildTarget,
  type QwikPluginOptions,
} from './plugin';

type QwikEsbuildPluginApi = {
  getOptimizer: () => Optimizer;
  getOptions: () => NormalizedQwikPluginOptions;
};

/** @public */
export function qwikEsbuild(qwikEsbuildOpts: QwikEsbuildPluginOptions = {}): Plugin {
  const qwikPlugin = createQwikPlugin(qwikEsbuildOpts.optimizerOptions);

  const esbuildPlugin: Plugin = {
    name: 'esbuild-plugin-qwik',

    setup(build: PluginBuild) {
      let initialized = false;

      // Initialize the plugin
      build.onStart(async () => {
        if (!initialized) {
          await qwikPlugin.init();
          initialized = true;

          // Set up diagnostic callback
          qwikPlugin.onDiagnostics((diagnostics, optimizer, srcDir) => {
            diagnostics.forEach((d) => {
              const id = qwikPlugin.normalizePath(optimizer.sys.path.join(srcDir, d.file));
              const message = d.message;

              if (d.category === 'error') {
                // ESBuild will handle this as an error
                console.error(`[Qwik] ${message} in ${id}`);
              } else {
                console.warn(`[Qwik] ${message} in ${id}`);
              }
            });
          });

          // Normalize options
          const pluginOpts: QwikPluginOptions = {
            csr: qwikEsbuildOpts.csr,
            target: qwikEsbuildOpts.target,
            buildMode: qwikEsbuildOpts.buildMode,
            debug: qwikEsbuildOpts.debug,
            entryStrategy: qwikEsbuildOpts.entryStrategy,
            rootDir: qwikEsbuildOpts.rootDir,
            srcDir: qwikEsbuildOpts.srcDir,
            srcInputs: qwikEsbuildOpts.srcInputs,
            input: qwikEsbuildOpts.input,
            resolveQwikBuild: true,
            manifestOutput: qwikEsbuildOpts.manifestOutput,
            manifestInput: qwikEsbuildOpts.manifestInput,
            transformedModuleOutput: qwikEsbuildOpts.transformedModuleOutput,
            inlineStylesUpToBytes: qwikEsbuildOpts.optimizerOptions?.inlineStylesUpToBytes,
            lint: qwikEsbuildOpts.lint,
            experimental: qwikEsbuildOpts.experimental,
            outDir: qwikEsbuildOpts.outDir,
            assetsDir: qwikEsbuildOpts.assetsDir,
            sourcemap: qwikEsbuildOpts.sourcemap,
          };

          qwikPlugin.normalizeOptions(pluginOpts);

          // Call buildStart equivalent
          const ctx = createMockRollupContext(build);
          await qwikPlugin.buildStart(ctx);
        }
      });

      // Handle module resolution
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.path.startsWith('\0')) {
          return undefined;
        }

        const ctx = createMockRollupContext(build);
        const result = await qwikPlugin.resolveId(ctx, args.path, args.importer);

        if (result && typeof result === 'object' && 'id' in result) {
          return {
            path: result.id,
            namespace: result.external ? 'external' : 'qwik',
            external: typeof result.external === 'boolean' ? result.external : false,
          };
        } else if (typeof result === 'string') {
          return {
            path: result,
            namespace: 'qwik',
          };
        }

        return undefined;
      });

      // Handle module loading
      build.onLoad({ filter: /.*/, namespace: 'qwik' }, async (args) => {
        if (args.path.startsWith('\0')) {
          return undefined;
        }

        const ctx = createMockRollupContext(build);
        const result = await qwikPlugin.load(ctx, args.path);

        if (result && typeof result === 'object') {
          return {
            contents: result.code,
            loader: getLoaderForFile(args.path),
            resolveDir: qwikPlugin.getPath().dirname(args.path),
          };
        } else if (typeof result === 'string') {
          return {
            contents: result,
            loader: getLoaderForFile(args.path),
            resolveDir: qwikPlugin.getPath().dirname(args.path),
          };
        }

        return undefined;
      });

      // Handle transformation for files that need Qwik processing
      build.onLoad({ filter: /\.(tsx?|jsx?)$/ }, async (args) => {
        if (args.path.startsWith('\0')) {
          return undefined;
        }

        const sys = qwikPlugin.getSys();
        const path = qwikPlugin.getPath();

        // Check if this file needs Qwik transformation
        const ext = path.extname(args.path).toLowerCase();
        const needsTransform =
          ['.tsx', '.ts', '.jsx', '.js'].includes(ext) || /\.qwik\.[mc]?js$/.test(args.path);

        if (!needsTransform) {
          return undefined;
        }

        try {
          // Read the file content
          let code: string | undefined;
          if (sys.env === 'node') {
            const fs: typeof import('fs') = await sys.dynamicImport('node:fs');
            code = await fs.promises.readFile(args.path, 'utf-8');
          } else {
            // For non-Node environments, we can't read files from the filesystem
            // This should be handled differently in a real implementation
            console.warn(`[Qwik] Cannot read file ${args.path} in ${sys.env} environment`);
            return undefined;
          }

          if (!code) {
            return undefined;
          }

          const ctx = createMockRollupContext(build);
          const result = await qwikPlugin.transform(ctx, code, args.path);

          if (result && typeof result === 'object') {
            return {
              contents: result.code,
              loader: getLoaderForFile(args.path),
              resolveDir: path.dirname(args.path),
            };
          }
        } catch (error) {
          console.error(`[Qwik] Error transforming ${args.path}:`, error);
        }

        return undefined;
      });

      // Handle build completion
      build.onEnd(async (result) => {
        const opts = qwikPlugin.getOptions();

        if (opts.target === 'client' && !result.errors.length) {
          // Generate manifest for client builds
          try {
            const ctx = createMockRollupContext(build);
            const mockBundle = {}; // ESBuild doesn't have the same bundle structure
            await qwikPlugin.generateManifest(ctx, mockBundle);
          } catch (error) {
            console.error('[Qwik] Error generating manifest:', error);
          }
        }
      });
    },
  };

  // Add API methods to the plugin
  (esbuildPlugin as any).api = {
    getOptimizer: () => qwikPlugin.getOptimizer(),
    getOptions: () => qwikPlugin.getOptions(),
  };

  return esbuildPlugin;
}

function createMockRollupContext(build: PluginBuild): any {
  return {
    // Mock the essential Rollup context methods that the Qwik plugin uses
    resolve: async (id: string, importer?: string) => {
      // In ESBuild, we don't have a direct equivalent to Rollup's resolve
      // We'll need to handle this differently or implement a basic resolver
      return { id, external: false };
    },
    load: async (options: { id: string }) => {
      // Mock load method - ESBuild handles this differently
      return null;
    },
    emitFile: (file: any) => {
      // Mock emitFile - ESBuild handles assets differently
      return '';
    },
    getFileName: (id: string) => {
      // Mock getFileName
      return id;
    },
    addWatchFile: (file: string) => {
      // Mock addWatchFile - ESBuild handles watch mode differently
    },
    error: (error: any) => {
      throw error;
    },
    warn: (warning: any) => {
      console.warn(warning);
    },
    meta: {
      rollupVersion: 'esbuild-mock',
    },
  };
}

function getLoaderForFile(filePath: string): 'js' | 'jsx' | 'ts' | 'tsx' | 'css' | 'json' | 'text' {
  const ext = filePath.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'tsx':
      return 'tsx';
    case 'ts':
      return 'ts';
    case 'jsx':
      return 'jsx';
    case 'js':
      return 'js';
    case 'css':
      return 'css';
    case 'json':
      return 'json';
    default:
      return 'text';
  }
}

/** @public */
export interface QwikEsbuildPluginOptions {
  csr?: boolean;
  /**
   * Build `production` or `development`.
   *
   * Default `development`
   */
  buildMode?: QwikBuildMode;
  /**
   * Target `client` or `ssr`.
   *
   * Default `client`
   */
  target?: QwikBuildTarget;
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
   * Alternative to `srcDir`, where `srcInputs` is able to provide the files manually. This option
   * is useful for an environment without a file system, such as a webworker.
   *
   * Default: `null`
   */
  srcInputs?: TransformModuleInput[] | null;
  /**
   * The root of the application, which is commonly the same directory as `package.json` and
   * `esbuild.config.js`.
   *
   * Default `process.cwd()`
   */
  rootDir?: string;
  /**
   * The client build will create a manifest and this hook is called with the generated build data.
   *
   * Default `undefined`
   */
  manifestOutput?: (manifest: QwikManifest) => Promise<void> | void;
  /**
   * The SSR build requires the manifest generated during the client build. The `manifestInput`
   * option can be used to manually provide a manifest.
   *
   * Default `undefined`
   */
  manifestInput?: QwikManifest;
  optimizerOptions?: OptimizerOptions;
  /**
   * Hook that's called after the build and provides all of the transformed modules that were used
   * before bundling.
   */
  transformedModuleOutput?:
    | ((transformedModules: TransformModule[]) => Promise<void> | void)
    | null;
  /**
   * Run eslint on the source files for the ssr build or dev server. This can slow down startup on
   * large projects. Defaults to `true`
   */
  lint?: boolean;
  /**
   * Experimental features. These can come and go in patch releases, and their API is not guaranteed
   * to be stable between releases.
   */
  experimental?: (keyof typeof ExperimentalFeatures)[];
  /** Input files or entry points */
  input?: string[] | string | { [entry: string]: string };
  /** Output directory */
  outDir?: string;
  /** Assets directory */
  assetsDir?: string;
  /** Enable sourcemaps */
  sourcemap?: boolean;
}

export { ExperimentalFeatures } from './plugin';

/** @public */
export type QwikEsbuildPlugin = Plugin & { api: QwikEsbuildPluginApi };
