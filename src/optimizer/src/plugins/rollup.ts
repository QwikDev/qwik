import type { Plugin as RollupPlugin, RollupError } from 'rollup';
import type {
  Diagnostic,
  Optimizer,
  OptimizerOptions,
  OutputEntryMap,
  TransformModule,
} from '../types';
import { BasePluginOptions, createPlugin } from './plugin';

/**
 * @alpha
 */
export function qwikRollup(inputOpts: QwikRollupPluginOptions = {}): any {
  const qwikPlugin = createPlugin(inputOpts as OptimizerOptions);

  const api: QwikRollupPluginApi = {
    outputEntryMap: null,
    transformedOutputs: null,
  };

  const rollupPlugin: QwikRollupPlugin = {
    name: 'rollup-plugin-qwik',

    api,

    async options(inputOptions) {
      inputOptions.onwarn = (warning, warn) => {
        if (warning.plugin === 'typescript' && warning.message.includes('outputToFilesystem')) {
          return;
        }
        warn(warning);
      };
      return inputOptions;
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

    resolveId(importee, importer) {
      return qwikPlugin.resolveId(importee, importer);
    },

    load(id) {
      return qwikPlugin.load(id);
    },

    transform(code, id) {
      if (id.startsWith('\0')) {
        return null;
      }
      return qwikPlugin.transform(code, id);
    },

    outputOptions(outputOpts) {
      if (outputOpts.format === 'cjs' && typeof outputOpts.exports !== 'string') {
        outputOpts.exports = 'auto';
      }
      return outputOpts;
    },

    async generateBundle(_, rollupBundle) {
      // for (const fileName in rollupBundle) {
      //   const b = rollupBundle[fileName];
      //   if (b.type === 'chunk' && b.isDynamicEntry) {
      //     qwikPlugin.addOutputBundle({
      //       fileName,
      //       modules: b.modules,
      //     });
      //   }
      // }
      // api.outputEntryMap = await qwikPlugin.generateOutputEntryMap();
      // api.transformedOutputs = await qwikPlugin.getTransformedOutputs();
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
export interface QwikRollupPluginOptions extends BasePluginOptions {
  optimizerOptions?: OptimizerOptions;
}

export interface QwikRollupPlugin extends RollupPlugin {
  api: QwikRollupPluginApi;
}

export interface QwikRollupPluginApi {
  outputEntryMap: OutputEntryMap | null;
  transformedOutputs: { [id: string]: TransformModule } | null;
}
