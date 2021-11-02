import type { Plugin } from 'rollup'; 
import { Optimizer, TransformFileOptions, TransformedOutput } from '..'; 
import { isAbsolute, normalize } from 'path';
import { ManifestBuilder } from '../manifest';

export function qwik(): Plugin {
  const optimizer = new Optimizer();
  const entryModules = new Map<string, TransformedOutput>();

  return {
    name: 'qwikPlugin',

    async options(rollupInputOpts) {
      // Takes the user's Rollup input options to find the source input files,
      // then generates Qwik input files which rollup should use instead as input files.
      const transformOpts: TransformFileOptions = {
        input: [],
        outDir: '@dist',
        minify: false,
        recursiveDir: true,
        sourceMaps: true,
        transpile: false,
        write: false,
      }

      if (rollupInputOpts.input) {
        if (typeof rollupInputOpts.input === 'string') {
          // input is a single file path
          addInputDirectory(transformOpts, rollupInputOpts.input)
        } else if (Array.isArray(rollupInputOpts.input)) {
          // input is an array of input file paths
          rollupInputOpts.input.forEach(path => addInputDirectory(transformOpts, path));
        } else {
          // input is an object of entry names and input file paths
          Object.values(rollupInputOpts.input).forEach(path => addInputDirectory(transformOpts, path));
        }
      }

      if (transformOpts.input.length > 0) {
        // send the user's input files to be transformed
        const result = await optimizer.transform(transformOpts);

        // throw error or print logs if there are any diagnostics
        result.diagnostics.forEach(d => {
          if (d.type === 'error') {
            throw d.message;
          } else if (d.type === 'warn') {
            console.warn('QWIK:', d.message);
          } else {
            console.info('QWIK:', d.message);
          }
        });

        // ensure we reset the entry module map
        entryModules.clear();

        // now that we've got the user's inputs transformed
        // let's reset rollup's input option to use Qwik's transformed entries
        const qwikEntryPaths = result.output.map(output => {
          // use the transform output file path as rollup's new input
          // this transformed file is only in-memory and not found on disk
          // the resolveId() and load() hooks will find this in the entry module map

          // keep the state of each entry output to be looked up later
          entryModules.set(output.outFile, output);

          // return the outFile path  so it's rollup's entry input file
          return output.outFile;
        });

        // Return the new rollup options which have been modified with Qwik's entry modules
        return {
          ...rollupInputOpts,
          input: qwikEntryPaths,
        };
      }

      // make no changes to the original rollup options
      return null;
    },

    resolveId(id) {
      if (entryModules.has(id)) {
        // this is one of Qwik's entry modules, which is only in-memory
        return id;
      }
      return null;
    },

    load(id) {
      const entryModule = entryModules.get(id);
      if (entryModule) {
        // this is one of Qwik's entry modules, which is only in-memory
        return {
          code: entryModule.code!,
          map: entryModule.map
        }
      }
      return null;
    },

    generateBundle(rollupOutputOptions, bundle) {
      const manifest = new ManifestBuilder();

      for (const fileName in bundle) {
        const file = bundle[fileName];
        if (file.type === 'chunk') {
          // add each to the Qwik manifest
          manifest.addFile({

          });
        }
      }
 
      // add the manifest to the rollup output
      this.emitFile({
        fileName: 'q-manifest.json',
        source: JSON.stringify(manifest.generate(), null, 2),
        type: 'asset'
      });
    }
  };
}

function addInputDirectory(transformOpts: TransformFileOptions, path: string) {
  if (typeof path === 'string') {
    path = normalize(path);

    if (!isAbsolute(path)) {
      // just easier this way
      throw new Error(`Input path must be absolute: ${path}`);
    }

    if (!transformOpts.input.some(i => i.path === path)) {
      transformOpts.input.push({ path });
    }
  }
}
