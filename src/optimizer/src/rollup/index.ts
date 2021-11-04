import { EntryStrategy, Optimizer, OutputEntryMap, TransformDirectoryOptions } from '..';
import { dirname, isAbsolute } from 'path';
import type { InputOption, OutputBundle, Plugin } from 'rollup';

export function qwik(opts: QwikPluginOptions = {}): Plugin {
  const optimizer = new Optimizer();

  return {
    name: 'qwikPlugin',

    async options(rollupInputOpts) {
      // Takes the user's Rollup input options to find the source input files,
      // then generates Qwik input files which rollup should use instead as input files.

      const transformOpts: TransformDirectoryOptions = {
        inputDir: findInputDirectory(rollupInputOpts.input),
        entryStrategy: opts.entryStrategy,
        glob: opts.glob,
        sourceMaps: 'external',
      };

      const result = await optimizer.transformDirectory(transformOpts);

      // throw error or print logs if there are any diagnostics
      result.diagnostics.forEach((d) => {
        if (d.type === 'error') {
          throw d.message;
        } else if (d.type === 'warn') {
          console.warn('QWIK:', d.message);
        } else {
          console.info('QWIK:', d.message);
        }
      });

      const entryPaths = result.output.filter((file) => file.isEntry).map((file) => file.outFile);

      // return the new rollup options which have been modified with Qwik's entry modules
      return {
        ...rollupInputOpts,
        input: entryPaths,
      };
    },

    resolveId(id) {
      if (optimizer.hasTransformedModule(id)) {
        // this is one of Qwik's entry modules, which is only in-memory
        return id;
      }
      return null;
    },

    load(id) {
      const transformedModule = optimizer.getTransformedModule(id);
      if (transformedModule) {
        // this is one of Qwik's entry modules, which is only in-memory
        return {
          code: transformedModule.code!,
          map: transformedModule.map,
        };
      }
      return null;
    },

    renderDynamicImport() {
      // todo??
      return null;
    },

    generateBundle(_, rollupBundle) {
      this.emitFile({
        fileName: 'q-entry-map.json',
        source: generateOutputEntryMap(rollupBundle),
        type: 'asset',
      });
    },

    watchChange(id, change) {
      optimizer.watchChange(id, change.event);
    },
  };
}

function findInputDirectory(rollupInput: InputOption | undefined) {
  const inputFilePaths: string[] = [];

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

  if (inputFilePaths.length === 0) {
    throw new Error(`Valid absolute input path required`);
  }

  inputFilePaths.forEach((inputFilePath) => {
    if (!isAbsolute(inputFilePath)) {
      throw new Error(`Input path must be absolute: ${inputFilePath}`);
    }
  });

  const sortedInputDirPaths = Array.from(new Set(inputFilePaths.map(dirname))).sort((a, b) => {
    if (a.length < b.length) return -1;
    if (a.length > b.length) return 1;
    return 0;
  });

  return sortedInputDirPaths[0];
}

function generateOutputEntryMap(rollupBundle: OutputBundle) {
  const outputEntryMap: OutputEntryMap = {};

  for (const fileName in rollupBundle) {
    const file = rollupBundle[fileName];
    if (file.type === 'chunk') {
      // todo
    }
  }

  return JSON.stringify(outputEntryMap, null, 2);
}

export interface QwikPluginOptions {
  entryStrategy?: EntryStrategy;
  glob?: string;
}
