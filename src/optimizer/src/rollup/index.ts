import {
  EntryStrategy,
  MinifyMode,
  Optimizer,
  createOptimizer,
  OutputEntryMap,
  Path,
  TransformFsOptions,
  TransformOutput,
  TransformModule,
} from '..';

import type { InputOption, NormalizedOutputOptions, Plugin } from 'rollup';

/**
 * @alpha
 */
export function qwikRollup(opts: QwikPluginOptions = {}): any {
  const transformedOutputs = new Map<string, TransformModule>();
  let optimizer: Optimizer | undefined;
  let result: TransformOutput | undefined;
  let outputCount = 0;

  if (!opts.entryStrategy) {
    opts.entryStrategy = { type: 'hook' };
  }

  const plugin: Plugin = {
    name: 'qwik',

    options(inputOptions) {
      inputOptions.onwarn = (warning, warn) => {
        if (warning.plugin === 'typescript' && warning.message.includes('outputToFilesystem')) {
          // "@rollup/plugin-typescript: outputToFilesystem option is defaulting to true."
          return;
        }
        warn(warning);
      };
      return inputOptions;
    },

    async buildStart(options) {
      // Takes the user's Rollup input options to find the source input files,
      // then generates Qwik input files which rollup should use instead as input files.
      if (!optimizer) {
        optimizer = await createOptimizer();
      }
      outputCount = 0;
      const transformOpts: TransformFsOptions = {
        rootDir: findInputDirectory(optimizer.path, options.input),
        entryStrategy: opts.entryStrategy,
        minify: opts.minify,
        transpile: opts.transpile ?? true,
      };

      result = await optimizer.transformFs(transformOpts);
      result.modules.forEach((output) => {
        const path = output.path.split('.').slice(0, -1).join('.');
        const sep = optimizer?.path?.sep || '/';
        const key = transformOpts.rootDir + sep + path;
        transformedOutputs.set(key, output);
      });

      // throw error or print logs if there are any diagnostics
      result.diagnostics.forEach((d) => {
        if (d.severity === 'error') {
          throw d.message;
        } else if (d.severity === 'warn') {
          // eslint-disable-next-line
          console.warn('QWIK:', d.message);
        } else {
          // eslint-disable-next-line
          console.info('QWIK:', d.message);
        }
      });
    },

    async resolveId(id, importer) {
      if (importer) {
        if (!optimizer) {
          optimizer = await createOptimizer();
        }
        id = optimizer.path.resolve(optimizer.path.dirname(importer), id);
      }
      if (transformedOutputs.has(id)) {
        return id;
      }
      return null;
    },

    load(id) {
      id = id.replace(/\.(j|t)sx?$/, '');
      const transformedModule = transformedOutputs.get(id);
      if (transformedModule) {
        // this is one of Qwik's entry modules, which is only in-memory
        return {
          code: transformedModule.code,
          map: transformedModule.map,
        };
      }
      return null;
    },

    outputOptions(outputOpts) {
      if (outputOpts.format === 'cjs' && typeof outputOpts.exports !== 'string') {
        outputOpts.exports = 'auto';
        return outputOpts;
      }
      return null;
    },

    async generateBundle(outputOpts, rollupBundle) {
      if (result && outputOpts.format === 'es' && outputCount === 0 && opts.symbolsOutput) {
        outputCount++;
        const output = Object.entries(rollupBundle);

        const outputEntryMap: OutputEntryMap = {
          mapping: Object.fromEntries(
            result.hooks.map((h) => {
              const symbolName = h.name;
              let filename = h.canonicalFilename;
              // eslint-disable-next-line
              const found = output.find(([_, v]) => {
                return (
                  v.type == 'chunk' &&
                  v.isDynamicEntry === true &&
                  Object.keys(v.modules).find((f) => f.endsWith(filename))
                );
              });
              if (found) {
                filename = found[0];
              }
              return [symbolName, filename];
            })
          ),
          version: '1',
        };
        if (typeof opts.symbolsOutput === 'string') {
          this.emitFile({
            fileName: opts.symbolsOutput,
            source: JSON.stringify(outputEntryMap, null, 2),
            type: 'asset',
          });
        } else if (typeof opts.symbolsOutput === 'function') {
          await opts.symbolsOutput(outputEntryMap, outputOpts);
        }
      }
    },
  };

  return plugin;
}

function findInputDirectory(path: Path, rollupInput: InputOption | undefined) {
  let inputFilePaths: string[] = [];

  if (rollupInput) {
    if (typeof rollupInput === 'string') {
      // input is a single file path
      inputFilePaths.push(rollupInput);
    } else if (Array.isArray(rollupInput)) {
      // input is an array of input file paths
      rollupInput.forEach((path) => {
        inputFilePaths.push(path);
      });
    } else {
      // input is a map of input file paths
      Object.values(rollupInput).forEach((path) => {
        inputFilePaths.push(path);
      });
    }
  }

  inputFilePaths = inputFilePaths.map((p) => path.resolve(p));
  if (inputFilePaths.length === 0) {
    throw new Error(`Valid absolute input path required`);
  }

  const sortedInputDirPaths = Array.from(new Set(inputFilePaths.map(path.dirname))).sort((a, b) => {
    if (a.length < b.length) return -1;
    if (a.length > b.length) return 1;
    return 0;
  });

  return sortedInputDirPaths[0];
}

/**
 * @alpha
 */
export interface QwikPluginOptions {
  entryStrategy?: EntryStrategy;
  transpile?: boolean;
  minify?: MinifyMode;
  symbolsOutput?:
    | string
    | ((data: OutputEntryMap, output: NormalizedOutputOptions) => Promise<void> | void);
}
