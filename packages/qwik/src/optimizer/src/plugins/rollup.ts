import type { Plugin as RollupPlugin, RollupError } from 'rollup';
import type {
  Diagnostic,
  EntryStrategy,
  Optimizer,
  OptimizerOptions,
  QwikManifest,
  TransformModuleInput,
} from '../types';
import { createPlugin, QwikBuildMode, QwikBuildTarget, Q_MANIFEST_FILENAME } from './plugin';
import { versions } from '../versions';

/**
 * @alpha
 */
export function qwikRollup(qwikRollupOpts: QwikRollupPluginOptions = {}): any {
  const qwikPlugin = createPlugin(qwikRollupOpts.optimizerOptions);

  let optimizer: Optimizer | null = null;

  const rollupPlugin: QwikRollupPlugin = {
    name: 'rollup-plugin-qwik',

    api: {
      getOptimizer: () => qwikPlugin.getOptimizer(),
      getOptions: () => qwikPlugin.getOptions(),
    },

    async options(inputOpts) {
      inputOpts.onwarn = (warning, warn) => {
        if (warning.plugin === 'typescript' && warning.message.includes('outputToFilesystem')) {
          return;
        }
        warn(warning);
      };

      optimizer = await qwikPlugin.getOptimizer();

      const opts = await qwikPlugin.normalizeOptions(qwikRollupOpts);

      if (opts.target === 'ssr') {
        // Server input
        if (!inputOpts.input) {
          inputOpts.input = opts.ssr.input;
        }
        inputOpts.treeshake = false;
      } else {
        // Client input
        if (!inputOpts.input) {
          inputOpts.input = opts.client.input;
        }
      }

      return inputOpts;
    },

    outputOptions(outputOpts) {
      const opts = qwikPlugin.getOptions();

      if (opts.target === 'ssr') {
        // SSR output
        if (outputOpts.dir) {
          opts.ssr.outDir = qwikPlugin.normalizePath(
            optimizer!.sys.path.resolve(opts.rootDir, outputOpts.dir)
          );
        } else if (!outputOpts.dir) {
          outputOpts.dir = opts.ssr.outDir;
        }
      } else if (opts.target === 'client') {
        // Client output
        if (outputOpts.dir) {
          opts.client.outDir = qwikPlugin.normalizePath(
            optimizer!.sys.path.resolve(opts.rootDir, outputOpts.dir)
          );
        } else {
          outputOpts.dir = opts.client.outDir;
        }
        outputOpts.format = 'es';
      }
      if (outputOpts.format === 'cjs' && typeof outputOpts.exports !== 'string') {
        outputOpts.exports = 'auto';
      }

      return outputOpts;
    },

    async buildStart() {
      qwikPlugin.onAddWatchFile((path) => this.addWatchFile(path));

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
          node: process.versions.node,
          os: process.platform,
          rollup: '',
        };

        if (typeof opts.client.manifestOutput === 'function') {
          await opts.client.manifestOutput(manifest);
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

export const createRollupError = (optimizer: Optimizer, diagnostic: Diagnostic) => {
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
};

/**
 * @alpha
 */
export interface QwikRollupPluginOptions {
  buildMode?: QwikBuildMode;
  debug?: boolean;
  entryStrategy?: EntryStrategy;
  forceFullBuild?: boolean;
  optimizerOptions?: OptimizerOptions;
  manifestInput?: QwikManifest | null;
  manifestOutput?: ((manifest: QwikManifest) => Promise<void> | void) | null;
  srcDir?: string;
  srcInputs?: TransformModuleInput[] | null;
  rootDir?: string;
  target?: QwikBuildTarget;
}

export interface QwikRollupPlugin extends RollupPlugin {}
