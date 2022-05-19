import type { OutputOptions, Plugin as RollupPlugin, RollupError } from 'rollup';
import type {
  Diagnostic,
  EntryStrategy,
  Optimizer,
  OptimizerOptions,
  QwikManifest,
  TransformModuleInput,
  Path,
} from '../types';
import {
  createPlugin,
  NormalizedQwikPluginOptions,
  QwikBuildMode,
  QwikBuildTarget,
  QwikPluginOptions,
  Q_MANIFEST_FILENAME,
} from './plugin';
import { versions } from '../versions';

/**
 * @alpha
 */
export function qwikRollup(qwikRollupOpts: QwikRollupPluginOptions = {}): any {
  const qwikPlugin = createPlugin(qwikRollupOpts.optimizerOptions);

  const rollupPlugin: QwikRollupPlugin = {
    name: 'rollup-plugin-qwik',

    api: {
      getOptimizer: () => qwikPlugin.getOptimizer(),
      getOptions: () => qwikPlugin.getOptions(),
    },

    async options(inputOpts) {
      await qwikPlugin.init();

      inputOpts.onwarn = (warning, warn) => {
        if (warning.plugin === 'typescript' && warning.message.includes('outputToFilesystem')) {
          return;
        }
        warn(warning);
      };

      const pluginOpts: QwikPluginOptions = {
        target: qwikRollupOpts.target,
        buildMode: qwikRollupOpts.buildMode,
        debug: qwikRollupOpts.debug,
        forceFullBuild: qwikRollupOpts.forceFullBuild,
        entryStrategy: qwikRollupOpts.entryStrategy,
        rootDir: qwikRollupOpts.rootDir,
        srcDir: qwikRollupOpts.srcDir,
        srcInputs: qwikRollupOpts.srcInputs,
        input: inputOpts.input as string,
        manifestOutput: qwikRollupOpts.manifestOutput,
        manifestInput: qwikRollupOpts.manifestInput,
      };

      const opts = qwikPlugin.normalizeOptions(pluginOpts);

      if (!inputOpts.input) {
        inputOpts.input = opts.input;
      }

      if (opts.target === 'ssr') {
        // Server input
        inputOpts.treeshake = false;
      }

      return inputOpts;
    },

    outputOptions(rollupOutputOpts) {
      return normalizeRollupOutputOptions(
        qwikPlugin.getPath(),
        qwikPlugin.getOptions(),
        rollupOutputOpts
      );
    },

    async buildStart() {
      qwikPlugin.onAddWatchFile((p) => this.addWatchFile(p));

      qwikPlugin.onDiagnostics((diagnostics, optimizer) => {
        diagnostics.forEach((d) => {
          if (d.severity === 'Error') {
            this.error(createRollupError(optimizer, d));
          } else {
            this.warn(createRollupError(optimizer, d));
          }
        });
      });

      await qwikPlugin.buildStart();
    },

    resolveId(id, importer) {
      if (id.startsWith('\0')) {
        return null;
      }
      return qwikPlugin.resolveId(id, importer);
    },

    load(id) {
      if (id.startsWith('\0')) {
        return null;
      }
      return qwikPlugin.load(id);
    },

    transform(code, id) {
      if (id.startsWith('\0')) {
        return null;
      }
      return qwikPlugin.transform(code, id);
    },

    async generateBundle(_, rollupBundle) {
      const opts = qwikPlugin.getOptions();
      const path = qwikPlugin.getPath();

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
          }
        }

        const manifest = await outputAnalyzer.generateManifest();
        manifest.platform = {
          ...versions,
          rollup: '',
        };
        if (typeof process !== 'undefined' && process.versions) {
          manifest.platform.node = process.versions.node;
          manifest.platform.os = process.platform;
        }

        if (typeof opts.manifestOutput === 'function') {
          await opts.manifestOutput(manifest);
        }

        this.emitFile({
          type: 'asset',
          fileName: Q_MANIFEST_FILENAME,
          source: JSON.stringify(manifest, null, 2),
        });

        if (typeof opts.transformedModuleOutput === 'function') {
          await opts.transformedModuleOutput(qwikPlugin.getTransformedOutputs());
        }
      }
    },
  };

  return rollupPlugin;
}

export function normalizeRollupOutputOptions(
  path: Path,
  opts: NormalizedQwikPluginOptions,
  rollupOutputOpts: OutputOptions
) {
  const outputOpts = { ...rollupOutputOpts };

  if (opts.target === 'ssr') {
    // ssr output
    if (!outputOpts.entryFileNames) {
      outputOpts.entryFileNames = '[name].js';
    }
    if (!outputOpts.assetFileNames) {
      outputOpts.assetFileNames = '[name].[ext]';
    }
    if (!outputOpts.chunkFileNames) {
      outputOpts.chunkFileNames = '[name].js';
    }

    outputOpts.inlineDynamicImports = true;
  } else if (opts.target === 'client') {
    // client output

    if (opts.buildMode === 'production') {
      // client production output
      if (!outputOpts.entryFileNames) {
        outputOpts.entryFileNames = 'build/q-[hash].js';
      }
      if (!outputOpts.assetFileNames) {
        outputOpts.assetFileNames = 'build/q-[hash].[ext]';
      }
      if (!outputOpts.chunkFileNames) {
        outputOpts.chunkFileNames = 'build/q-[hash].js';
      }
    } else {
      // client development output
      if (!outputOpts.entryFileNames) {
        outputOpts.entryFileNames = 'build/[name].js';
      }
      if (!outputOpts.assetFileNames) {
        outputOpts.assetFileNames = 'build/[name].[ext]';
      }
      if (!outputOpts.chunkFileNames) {
        outputOpts.chunkFileNames = 'build/[name].js';
      }
    }
  }

  if (opts.target === 'client') {
    // client should always be es
    outputOpts.format = 'es';
  }

  if (!outputOpts.dir) {
    outputOpts.dir = opts.outDir;
  }

  if (outputOpts.format === 'cjs' && typeof outputOpts.exports !== 'string') {
    outputOpts.exports = 'auto';
  }

  return outputOpts;
}

export function createRollupError(optimizer: Optimizer, diagnostic: Diagnostic) {
  const loc = diagnostic.code_highlights[0]?.loc ?? {};
  const id = optimizer
    ? optimizer.sys.path.join(optimizer.sys.cwd(), diagnostic.origin)
    : diagnostic.origin;
  const err: RollupError = Object.assign(new Error(diagnostic.message), {
    id,
    plugin: 'qwik',
    loc: {
      column: loc.start_col,
      line: loc.start_line,
    },
    stack: '',
  });
  return err;
}

/**
 * @alpha
 */
export interface QwikRollupPluginOptions {
  /**
   * Build `production` or `development`.
   * Default `development`
   */
  buildMode?: QwikBuildMode;
  /**
   * Target `client` or `ssr`.
   * Default `client`
   */
  target?: QwikBuildTarget;
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
  forceFullBuild?: boolean;
  /**
   * The source directory to find all the Qwik components. Since Qwik
   * does not have a single input, the `srcDir` is use to recursively
   * find Qwik files.
   * Default `src`
   */
  srcDir?: string;
  /**
   * Alternative to `srcDir`, where `srcInputs` is able to provide the
   * files manually. This option is useful for an environment without
   * a file system, such as a webworker.
   * Default: `null`
   */
  srcInputs?: TransformModuleInput[] | null;
  /**
   * The root of the application, which is commonly the same
   * directory as `package.json` and `rollup.config.js`.
   * Default `process.cwd()`
   */
  rootDir?: string;
  /**
   * The client build will create a manifest and this hook
   * is called with the generated build data.
   * Default `undefined`
   */
  manifestOutput?: (manifest: QwikManifest) => Promise<void> | void;
  /**
   * The SSR build requires the manifest generated during the client build.
   * The `manifestInput` option can be used to manually provide a manifest.
   * Default `undefined`
   */
  manifestInput?: QwikManifest;
  optimizerOptions?: OptimizerOptions;
}

export interface QwikRollupPlugin extends RollupPlugin {}
