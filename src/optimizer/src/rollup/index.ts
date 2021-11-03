import type { Plugin } from 'rollup';
import { Optimizer, TransformFileOptions, Manifest } from '..';
import { parseManifest } from '../manifest';

export function qwik(opts: QwikPluginOptions = {}): Plugin {
  const optimizer = new Optimizer();
  let manifest: Manifest | undefined = undefined;

  return {
    name: 'qwikPlugin',

    async options(rollupInputOpts) {
      // ensure we reset the entry module map if the user's rollup input changes
      optimizer.clearModules();

      // Takes the user's Rollup input options to find the source input files,
      // then generates Qwik input files which rollup should use instead as input files.
      const transformOpts: TransformFileOptions = {
        input: [],
        minify: false,
        recursiveDir: true,
        sourceMaps: true,
        transpile: false,
        write: false,
      };

      if (rollupInputOpts.input) {
        if (typeof rollupInputOpts.input === 'string') {
          // input is a single file path
          optimizer.addSourceEntryPath(rollupInputOpts.input);
        } else if (Array.isArray(rollupInputOpts.input)) {
          // input is an array of input file paths
          rollupInputOpts.input.forEach((path) => {
            optimizer.addSourceEntryPath(path);
          });
        } else {
          // input is a map of input file paths
          Object.values(rollupInputOpts.input).forEach((path) => {
            optimizer.addSourceEntryPath(path);
          });
        }
      }

      if (transformOpts.input.length > 0) {
        if (!manifest) {
          manifest = await loadManifest(opts.manifestPath);
        }

        // send the user's input files to be transformed
        const result = await optimizer.transform(transformOpts);

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

        // now that we've got the user's inputs transformed
        // let's reset rollup's input option to use Qwik's transformed entries
        const qwikEntryPaths = optimizer.getTransformedEntryPaths(manifest);

        // Return the new rollup options which have been modified with Qwik's entry modules
        return {
          ...rollupInputOpts,
          input: qwikEntryPaths,
        };
      }

      return null;
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
      optimizer.clearOutputSymbols();

      for (const fileName in rollupBundle) {
        const file = rollupBundle[fileName];
        if (file.type === 'chunk') {
          optimizer.setOutputSymbols(file.fileName, file.exports);
        }
      }

      // add the manifest to the rollup output
      this.emitFile({
        fileName: 'q-manifest.yml',
        source: optimizer.serializeManifest(),
        type: 'asset',
      });
    },
  };
}

async function loadManifest(manifestPath?: string) {
  if (typeof manifestPath === 'string') {
    const fs = await import('fs');
    return new Promise<Manifest | undefined>((resolve, reject) => {
      fs.readFile(manifestPath, 'utf-8', (err, content) => {
        if (err) {
          reject(err);
        } else {
          const manifest = parseManifest(content);
          resolve(manifest);
        }
      });
    });
  }
}

export interface QwikPluginOptions {
  manifestPath?: string;
}
