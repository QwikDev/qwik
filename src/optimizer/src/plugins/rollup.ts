import type { Plugin as RollupPlugin, PluginContext, RollupError } from 'rollup';
import { createOptimizer } from '../optimizer';
import type {
  Diagnostic,
  EntryStrategy,
  GlobalInjections,
  HookAnalysis,
  MinifyMode,
  Optimizer,
  OutputEntryMap,
  TransformFsOptions,
  TransformModule,
  TransformModuleInput,
  TransformOutput,
} from '../types';
import { forceJSExtension, getBuildFile, QWIK_BUILD_ID, removeQueryParams } from './utils';

/**
 * @alpha
 */
export function qwikRollup(opts: QwikRollupPluginOptions): any {
  const ID = `${Math.round(Math.random() * 8999) + 1000}`;
  const debug = !!opts.debug;
  const injections: GlobalInjections[] = [];

  const api: QwikRollupPluginApi = {
    debug,
    entryStrategy: {
      type: 'single',
      ...opts.entryStrategy,
    },
    isBuild: true,
    isSSR: false,
    log: debug
      ? (...str: any[]) => {
          // eslint-disable-next-line no-console
          console.debug(`[QWIK PLUGIN: ${ID}]`, ...str);
        }
      : () => {},
    optimizer: null,
    outputCount: 0,
    results: new Map(),
    transformedOutputs: new Map(),
  };

  api.log(`New`, opts);

  const createRollupError = (rootDir: string, diagnostic: Diagnostic) => {
    const loc = diagnostic.code_highlights[0]?.loc ?? {};
    const id = api.optimizer
      ? api.optimizer.sys.path.join(rootDir, diagnostic.origin)
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

  const handleDiagnostics = (ctx: PluginContext, rootDir: string, diagnostics: Diagnostic[]) => {
    diagnostics.forEach((d) => {
      if (d.severity === 'Error') {
        ctx.error(createRollupError(rootDir, d));
      } else if (d.severity === 'Warning') {
        ctx.warn(createRollupError(rootDir, d));
      } else {
        ctx.warn(createRollupError(rootDir, d));
      }
    });
  };

  const rollupPlugin: QwikRollupPlugin = {
    name: 'rollup-plugin-qwik',

    api,

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

    async buildStart() {
      if (typeof opts.srcDir !== 'string' && !Array.isArray(opts.srcInputs)) {
        throw new Error(`Qwik plugin must have either a "srcDir" or "srcInputs" option.`);
      }
      if (typeof opts.srcDir === 'string' && Array.isArray(opts.srcInputs)) {
        throw new Error(`Qwik plugin cannot have both the "srcDir" and "srcInputs" options.`);
      }

      if (!api.optimizer) {
        api.optimizer = await createOptimizer();
      }

      const isFullBuild = api.entryStrategy.type !== 'hook';

      api.log(`buildStart()`, isFullBuild ? 'full build' : 'isolated build');

      if (isFullBuild) {
        api.outputCount = 0;

        let rootDir = '/';
        if (typeof opts.srcDir === 'string') {
          rootDir = api.optimizer.sys.path.isAbsolute(opts.srcDir)
            ? opts.srcDir
            : api.optimizer.sys.path.resolve(opts.srcDir);
        } else if (Array.isArray(opts.srcInputs)) {
          api.optimizer.sys.getInputFiles = async () => {
            return opts.srcInputs!;
          };
        }

        const transformOpts: TransformFsOptions = {
          rootDir,
          entryStrategy: opts.entryStrategy,
          minify: opts.minify,
          transpile: true,
          explicityExtensions: true,
        };

        const result = await api.optimizer.transformFs(transformOpts);
        for (const output of result.modules) {
          const key = api.optimizer.sys.path.join(rootDir, output.path)!;
          api.log(`buildStart()`, 'qwik module', key);
          api.transformedOutputs.set(key, [output, key]);
        }
        handleDiagnostics(this, rootDir, result.diagnostics);

        api.results.set('@buildStart', result);
      }
    },

    async resolveId(originalID, importer) {
      api.log(`resolveId("${originalID}", "${importer}")`);

      if ((api.isBuild || typeof opts.ssrBuild === 'boolean') && originalID === QWIK_BUILD_ID) {
        api.log(`resolveId()`, 'Resolved', QWIK_BUILD_ID);

        return {
          id: QWIK_BUILD_ID,
          moduleSideEffects: false,
        };
      }

      if (!api.optimizer) {
        api.optimizer = await createOptimizer();
      }

      let id = removeQueryParams(originalID);
      if (importer) {
        const filteredImporter = removeQueryParams(importer);
        const dir = api.optimizer.sys.path.dirname(filteredImporter);

        if (filteredImporter.endsWith('.html') && !id.endsWith('.html')) {
          id = api.optimizer.sys.path.join(dir, id);
        } else {
          id = api.optimizer.sys.path.resolve(dir, id);
        }
      }

      const tries = [forceJSExtension(api.optimizer.sys.path, id)];

      for (const tryId of tries) {
        api.log(`resolveId()`, 'Try', tryId);
        const transformedOutput = api.transformedOutputs.get(tryId);
        if (transformedOutput) {
          api.log(`resolveId()`, 'Resolved', tryId);
          const transformedModule = transformedOutput[0];
          const sideEffects = !transformedModule.isEntry || !transformedModule.hook;
          return {
            id: tryId,
            moduleSideEffects: sideEffects,
          };
        }
      }

      return null;
    },

    async load(id) {
      api.log(`load("${id}")`);
      if (id === QWIK_BUILD_ID) {
        api.log(`load()`, QWIK_BUILD_ID, api.isSSR ? 'ssr' : 'client');
        return {
          code: getBuildFile(api.isSSR),
        };
      }

      if (!api.optimizer) {
        api.optimizer = await createOptimizer();
      }

      // On full build, lets normalize the ID
      if (api.entryStrategy.type !== 'hook') {
        id = forceJSExtension(api.optimizer.sys.path, id);
      }

      const transformedModule = api.transformedOutputs.get(id);
      if (transformedModule) {
        api.log(`load()`, 'Found', id);

        return {
          code: transformedModule[0].code,
          map: transformedModule[0].map,
        };
      }
    },

    async transform(code, id) {
      // Only run when moduleIsolated === true
      if (api.entryStrategy.type !== 'hook') {
        return null;
      }
      if (id.startsWith('\0')) {
        return null;
      }
      api.log(`transform("${id}")`);

      const pregenerated = api.transformedOutputs.get(id);
      if (pregenerated) {
        api.log(`transform()`, 'addWatchFile', id, pregenerated[1]);
        this.addWatchFile(pregenerated[1]);

        return {
          meta: {
            hook: pregenerated[0].hook,
          },
        };
      }

      if (!api.optimizer) {
        api.optimizer = await createOptimizer();
      }

      const filteredId = removeQueryParams(id);
      const { ext, dir, base } = api.optimizer.sys.path.parse(filteredId);
      if (['.tsx', '.ts', '.jsx'].includes(ext)) {
        api.log(`transform()`, 'Transforming', filteredId);

        const newOutput = api.optimizer.transformModulesSync({
          input: [
            {
              code,
              path: base,
            },
          ],
          entryStrategy: { type: 'hook' },
          minify: opts.minify,
          sourceMaps: false,
          transpile: true,
          explicityExtensions: true,
          rootDir: dir,
        });

        handleDiagnostics(this, base, newOutput.diagnostics);
        api.results.set(filteredId, newOutput);

        api.transformedOutputs.clear();
        for (const [id, output] of api.results.entries()) {
          const justChanged = newOutput === output;
          const dir = api.optimizer.sys.path.dirname(id);

          for (const mod of output.modules) {
            if (mod.isEntry) {
              const key = api.optimizer.sys.path.join(dir, mod.path);
              api.transformedOutputs.set(key, [mod, id]);

              api.log(`transform()`, 'emitting', justChanged, key);
            }
          }
        }

        const module = newOutput.modules.find((m) => !m.isEntry)!;
        return {
          code: module.code,
          map: module.map,
          meta: {
            hook: module.hook,
          },
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
      api.log(`generateBundle()`);

      const hooks = Array.from(api.results.values())
        .flatMap((r) => r.modules)
        .map((mod) => mod.hook)
        .filter((h) => !!h) as HookAnalysis[];

      if (hooks.length > 0 && outputOpts.format === 'es' && api.outputCount === 0 && !api.isSSR) {
        api.outputCount++;
        const output = Object.entries(rollupBundle);

        const outputEntryMap: OutputEntryMap = {
          mapping: {},
          version: '1',
          injections,
        };

        hooks.forEach((h) => {
          const symbolName = h.name;
          let filename = h.canonicalFilename + '.js';
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
          outputEntryMap.mapping[symbolName] = filename;
        });

        api.log(`generateBundle()`, outputEntryMap);

        if (typeof opts.symbolsOutput === 'string') {
          this.emitFile({
            fileName: opts.symbolsOutput,
            source: JSON.stringify(outputEntryMap, null, 2),
            type: 'asset',
          });
        } else if (typeof opts.symbolsOutput === 'function') {
          const symbolsOutput = opts.symbolsOutput;
          setTimeout(async () => {
            await symbolsOutput(outputEntryMap, outputOpts as any);
          });
        }
      }
    },
  };

  return rollupPlugin;
}

/**
 * @alpha
 */
export interface QwikRollupPluginOptions {
  entryStrategy?: EntryStrategy;
  srcDir?: string;
  srcInputs?: TransformModuleInput[];
  minify?: MinifyMode;
  debug?: boolean;
  ssrBuild?: boolean;
  symbolsOutput?: string | ((data: OutputEntryMap, outputOptions: any) => Promise<void> | void);
}

export interface QwikRollupPlugin extends RollupPlugin {
  api: QwikRollupPluginApi;
}

export interface QwikRollupPluginApi {
  debug: boolean;
  entryStrategy: EntryStrategy;
  isBuild: boolean;
  isSSR: boolean;
  log: (...msg: any[]) => void;
  optimizer: Optimizer | null;
  outputCount: number;
  results: Map<string, TransformOutput>;
  transformedOutputs: Map<string, [TransformModule, string]>;
}
