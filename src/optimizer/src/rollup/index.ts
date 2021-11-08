import {
  EntryStrategy,
  MinifyMode,
  Optimizer,
  createOptimizer,
  OutputEntryMap,
  Path,
  TransformFsOptions,
  TransformResult,
} from '..';
import type { InputOption, OutputBundle, Plugin } from 'rollup';

/**
 * @alpha
 */
export function qwikRollup(opts: QwikPluginOptions = {}): Plugin {
  let optimizer: Optimizer | undefined;
  let result: TransformResult | undefined;

  return {
    name: 'qwikPlugin',

    async buildStart(options) {
      // Takes the user's Rollup input options to find the source input files,
      // then generates Qwik input files which rollup should use instead as input files.
      if (!optimizer) {
        optimizer = await createOptimizer();
      }

      const transformOpts: TransformFsOptions = {
        rootDir: findInputDirectory(optimizer.path, options.input),
        entryStrategy: opts.entryStrategy,
        glob: opts.glob,
        minify: opts.minify,
        transpile: opts.transpile ?? true,
      };

      console.time('Qwik optimize');
      result = await optimizer.transformFs(transformOpts);
      console.timeEnd('Qwik optimize');

      // throw error or print logs if there are any diagnostics
      result.diagnostics.forEach((d) => {
        if (d.severity === 'error') {
          throw d.message;
        } else if (d.severity === 'warn') {
          console.warn('QWIK:', d.message);
        } else {
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
      if (optimizer!.hasTransformedModule(id)) {
        return id;
      }
      return null;
    },

    load(id) {
      const transformedModule = optimizer!.getTransformedModule(id);
      if (transformedModule) {
        // this is one of Qwik's entry modules, which is only in-memory
        return {
          code: transformedModule.code,
          map: transformedModule.map,
        };
      }
      return null;
    },

    generateBundle(_, rollupBundle) {
      const entryMapFile = opts.entryMapFile === undefined ? "q-entry-map.json" : null;
      if (result && entryMapFile) {
        const output = Object.entries(rollupBundle);
        const outputEntryMap: OutputEntryMap = {
          version: '1',
          mapping: Object.fromEntries(result.hooks.map(h => {
            let entry = h.canonicalFilename;
            let value = entry;
            let found = output.find(([_, v]) => {
              return v.type == 'chunk' && v.isDynamicEntry === true && Object.keys(v.modules).find(f => f.endsWith(value))
            });
            if (found) {
              value = found[0];
            }
            return [entry, value];
          }))
        };

        this.emitFile({
          fileName: entryMapFile,
          source: JSON.stringify(outputEntryMap, undefined, 2),
          type: 'asset',
        });
      }
    },

    watchChange(id, change) {
      optimizer!.watchChange(id, change.event);
    },
  };
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
  glob?: string;
  transpile?: boolean;
  minify?: MinifyMode;
  entryMapFile?: string | null;
}
