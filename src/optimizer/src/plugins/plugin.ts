import { createOptimizer } from '../optimizer';
import type {
  Diagnostic,
  EntryStrategy,
  GlobalInjections,
  HookAnalysis,
  MinifyMode,
  Optimizer,
  OptimizerOptions,
  OutputEntryMap,
  TransformFsOptions,
  TransformModule,
  TransformModuleInput,
  TransformOutput,
} from '../types';

export function createPlugin(optimizerOptions: OptimizerOptions = {}) {
  const id = `${Math.round(Math.random() * 899) + 100}`;
  const results = new Map<string, TransformOutput>();
  const injections: GlobalInjections[] = [];
  const transformedOutputs = new Map<string, [TransformModule, string]>();

  let optimizer: Optimizer | null = null;
  let outputCount = 0;
  let addWatchFileCallback: (path: string) => void = () => {};
  let diagnosticsCallback: (d: Diagnostic[], optimizer: Optimizer) => void = () => {};

  const opts: NormalizedQwikPluginConfig = {
    debug: false,
    rootDir: null as any,
    distClientDir: null as any,
    distServerDir: null as any,
    isDevBuild: true,
    isSSRBuild: false,
    entryStrategy: null as any,
    minify: null as any,
    srcDir: null as any,
    srcInputs: null as any,
    srcMain: null as any,
    srcEntryServer: null as any,
    symbolsOutput: null,
  };

  const normalizeOptions = async (inputOpts?: QwikPluginOptions) => {
    const updatedOpts: NormalizedQwikPluginConfig = Object.assign({}, inputOpts) as any;

    const optimizer = await getOptimizer();

    opts.debug = !!updatedOpts.debug;
    opts.isDevBuild = !!updatedOpts.isDevBuild;
    opts.isSSRBuild = !!updatedOpts.isSSRBuild;

    if (updatedOpts.entryStrategy && typeof updatedOpts.entryStrategy === 'object') {
      opts.entryStrategy = { ...updatedOpts.entryStrategy };
    }
    if (!opts.entryStrategy) {
      if (opts.isDevBuild) {
        opts.entryStrategy = { type: 'hook' };
      } else {
        opts.entryStrategy = { type: 'single' };
      }
    }

    if (updatedOpts.minify) {
      opts.minify = updatedOpts.minify;
    }
    if (opts.minify !== 'minify' && opts.minify !== 'none' && opts.minify !== 'simplify') {
      if (opts.isDevBuild) {
        opts.minify = 'none';
      } else {
        opts.minify = 'minify';
      }
    }

    if (typeof updatedOpts.rootDir === 'string') {
      opts.rootDir = updatedOpts.rootDir;
    }
    if (typeof opts.rootDir !== 'string') {
      opts.rootDir = optimizer.sys.cwd();
    } else if (!optimizer.sys.path.isAbsolute(opts.rootDir)) {
      opts.rootDir = optimizer.sys.path.resolve(optimizer.sys.cwd(), opts.rootDir);
    }

    if (typeof updatedOpts.srcDir === 'string') {
      opts.srcDir = updatedOpts.srcDir;
      opts.srcInputs = null;
    } else if (Array.isArray(updatedOpts.srcInputs)) {
      opts.srcInputs = [...updatedOpts.srcInputs];
      opts.srcDir = null;
    }

    if (Array.isArray(opts.srcInputs)) {
      opts.srcInputs.forEach((i) => {
        i.path = optimizer.sys.path.resolve(opts.rootDir, i.path);
      });
    } else {
      opts.srcDir = optimizer.sys.path.resolve(opts.rootDir, SRC_DIR_DEFAULT);
    }

    if (typeof opts.srcDir === 'string' && !optimizer.sys.path.isAbsolute(opts.srcDir)) {
      opts.srcDir = optimizer.sys.path.resolve(opts.rootDir, opts.srcDir);
    }

    if (typeof updatedOpts.srcMain === 'string') {
      opts.srcMain = updatedOpts.srcMain;
    }
    if (typeof opts.srcMain !== 'string') {
      opts.srcMain = optimizer.sys.path.resolve(
        opts.rootDir,
        SRC_DIR_DEFAULT,
        MAIN_FILENAME_DEFAULT
      );
    }
    if (typeof opts.srcMain === 'string' && !optimizer.sys.path.isAbsolute(opts.srcMain)) {
      opts.srcMain = optimizer.sys.path.resolve(opts.rootDir, opts.srcMain);
    }

    if (typeof updatedOpts.srcEntryServer === 'string') {
      opts.srcEntryServer = updatedOpts.srcEntryServer;
    }
    if (typeof opts.srcEntryServer !== 'string') {
      opts.srcEntryServer = optimizer.sys.path.resolve(
        opts.rootDir,
        SRC_DIR_DEFAULT,
        ENTRY_SERVER_FILENAME_DEFAULT
      );
    }
    if (
      typeof opts.srcEntryServer === 'string' &&
      !optimizer.sys.path.isAbsolute(opts.srcEntryServer)
    ) {
      opts.srcEntryServer = optimizer.sys.path.resolve(opts.rootDir, opts.srcEntryServer);
    }

    if (typeof updatedOpts.distClientDir === 'string') {
      opts.distClientDir = updatedOpts.distClientDir;
    }
    if (typeof opts.distClientDir !== 'string') {
      opts.distClientDir = optimizer.sys.path.resolve(optimizer.sys.cwd(), 'dist');
    } else if (!optimizer.sys.path.isAbsolute(opts.distClientDir)) {
      opts.distClientDir = optimizer.sys.path.resolve(optimizer.sys.cwd(), opts.distClientDir);
    }

    if (typeof updatedOpts.distServerDir === 'string') {
      opts.distServerDir = updatedOpts.distServerDir;
    }
    if (typeof opts.distServerDir !== 'string') {
      opts.distServerDir = optimizer.sys.path.resolve(optimizer.sys.cwd(), 'server');
    } else if (!optimizer.sys.path.isAbsolute(opts.distServerDir)) {
      opts.distServerDir = optimizer.sys.path.resolve(optimizer.sys.cwd(), opts.distServerDir);
    }

    if (updatedOpts.symbolsOutput) {
      opts.symbolsOutput = updatedOpts.symbolsOutput;
    }

    return { ...opts };
  };

  const getOptimizer = async () => {
    if (!optimizer) {
      optimizer = await createOptimizer(optimizerOptions);
    }
    return optimizer;
  };

  const buildStart = async () => {
    const isFullBuild = opts.entryStrategy?.type !== 'hook';

    log(`buildStart()`, isFullBuild ? 'full build' : 'isolated build');

    if (isFullBuild) {
      const optimizer = await getOptimizer();
      outputCount = 0;

      let rootDir = '/';
      if (typeof opts.srcDir === 'string') {
        rootDir = opts.srcDir;
        log(`buildStart() srcDir`, opts.srcDir);
      } else if (Array.isArray(opts.srcInputs)) {
        optimizer.sys.getInputFiles = async () => opts.srcInputs!;
        log(`buildStart() opts.srcInputs (${opts.srcInputs.length})`);
      }

      const transformOpts: TransformFsOptions = {
        rootDir: rootDir,
        entryStrategy: opts.entryStrategy,
        minify: opts.minify,
        transpile: true,
        explicityExtensions: true,
      };

      const result = await optimizer.transformFs(transformOpts);
      for (const output of result.modules) {
        const key = optimizer.sys.path.join(rootDir, output.path)!;
        log(`buildStart()`, 'qwik module', key);
        transformedOutputs.set(key, [output, key]);
      }

      diagnosticsCallback(result.diagnostics, optimizer);

      results.set('@buildStart', result);
    }
  };

  const resolveId = async (id: string, importer: string | undefined) => {
    if (id === QWIK_BUILD_ID) {
      log(`resolveId()`, 'Resolved', QWIK_BUILD_ID);
      return {
        id: QWIK_BUILD_ID,
        moduleSideEffects: false,
      };
    }

    log(`resolveId("${id}", "${importer}")`);
    const optimizer = await getOptimizer();

    let filteredId = removeQueryParams(id);
    if (importer) {
      const filteredImporter = removeQueryParams(importer);
      const dir = optimizer.sys.path.dirname(filteredImporter);

      if (filteredImporter.endsWith('.html') && !filteredId.endsWith('.html')) {
        filteredId = optimizer.sys.path.join(dir, filteredId);
      } else {
        filteredId = optimizer.sys.path.resolve(dir, filteredId);
      }
    }

    const tries = [forceJSExtension(optimizer.sys.path, filteredId)];
    for (const tryId of tries) {
      log(`resolveId()`, 'Try', tryId);
      const transformedOutput = transformedOutputs.get(tryId);
      if (transformedOutput) {
        log(`resolveId()`, 'Resolved', tryId);
        const transformedModule = transformedOutput[0];
        const sideEffects = !transformedModule.isEntry || !transformedModule.hook;
        return {
          id: tryId,
          moduleSideEffects: sideEffects,
        };
      }
    }

    return null;
  };

  const load = async (id: string) => {
    if (id === QWIK_BUILD_ID) {
      log(`load()`, QWIK_BUILD_ID, opts.isSSRBuild ? 'ssr' : 'client');
      return {
        code: getBuildFile(opts.isSSRBuild),
      };
    }

    const optimizer = await getOptimizer();

    if (opts.entryStrategy.type !== 'hook') {
      // On full build, lets normalize the ID
      id = forceJSExtension(optimizer.sys.path, id);
    }

    const transformedModule = transformedOutputs.get(id);
    if (transformedModule) {
      log(`load()`, 'Found', id);
      return {
        code: transformedModule[0].code,
        map: transformedModule[0].map,
      };
    }

    log(`load()`, 'Not Found', id);

    return null;
  };

  const transform = async (code: string, id: string) => {
    if (opts.entryStrategy.type !== 'hook') {
      // Only run when moduleIsolated === true
      return null;
    }

    const pregenerated = transformedOutputs.get(id);
    if (pregenerated) {
      log(`transform() pregenerated, addWatchFile`, id, pregenerated[1]);
      addWatchFileCallback(pregenerated[1]);

      return {
        meta: {
          hook: pregenerated[0].hook,
        },
      };
    }

    const optimizer = await getOptimizer();

    const filteredId = removeQueryParams(id);
    const { ext, dir, base } = optimizer.sys.path.parse(filteredId);

    if (TRANSFORM_EXTS[ext]) {
      log(`transform()`, 'Transforming', filteredId);

      const newOutput = optimizer.transformModulesSync({
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

      diagnosticsCallback(newOutput.diagnostics, optimizer);

      results.set(filteredId, newOutput);

      transformedOutputs.clear();

      for (const [id, output] of results.entries()) {
        const justChanged = newOutput === output;
        const dir = optimizer.sys.path.dirname(id);

        for (const mod of output.modules) {
          if (mod.isEntry) {
            const key = optimizer.sys.path.join(dir, mod.path);
            transformedOutputs.set(key, [mod, id]);

            log(`transform()`, 'emitting', justChanged, key);
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

    log(`transform()`, 'No Transforming', id);

    return null;
  };

  const createOutputAnalyzer = () => {
    const bundles: GeneratedOutputBundle[] = [];

    const addBundle = (b: GeneratedOutputBundle) => bundles.push(b);

    const getBundles = () => bundles;

    const generateOutputEntryMap = async () => {
      const outputEntryMap: OutputEntryMap = {
        version: '1',
        mapping: {},
        injections,
      };

      const hooks = Array.from(results.values())
        .flatMap((r) => r.modules)
        .map((mod) => mod.hook)
        .filter((h) => !!h) as HookAnalysis[];

      if (hooks.length > 0 && outputCount === 0) {
        outputCount++;

        hooks.forEach((h) => {
          const symbolName = h.name;
          let filename = h.canonicalFilename + '.js';

          const found = bundles.find((b) => {
            return Object.keys(b.modules).find((f) => f.endsWith(filename));
          });

          if (found) {
            filename = found.fileName;
          }
          outputEntryMap.mapping[symbolName] = filename;
        });
      }

      log(`generateOutputEntryMap()`, outputEntryMap);

      return outputEntryMap;
    };

    return { addBundle, getBundles, generateOutputEntryMap };
  };

  const getOptions = async () => ({ ...opts });

  const getTransformedOutputs = async () => {
    const to: { [id: string]: TransformModule } = {};
    for (const [v, id] of transformedOutputs.values()) {
      to[id] = v;
    }
    return to;
  };

  const log = (...str: any[]) => {
    if (opts.debug) {
      // eslint-disable-next-line no-console
      console.debug(`[QWIK PLUGIN: ${id}]`, ...str);
    }
  };

  const onAddWatchFile = (cb: (path: string) => void) => {
    addWatchFileCallback = cb;
  };

  const onDiagnostics = (cb: (d: Diagnostic[], optimizer: Optimizer) => void) => {
    diagnosticsCallback = cb;
  };

  return {
    buildStart,
    createOutputAnalyzer,
    getOptimizer,
    getOptions,
    getTransformedOutputs,
    load,
    log,
    normalizeOptions,
    onAddWatchFile,
    onDiagnostics,
    resolveId,
    transform,
  };
}

function getBuildFile(isSSR: boolean) {
  return `
export const isServer = ${isSSR};
export const isBrowser = ${!isSSR};
`;
}

function removeQueryParams(id: string) {
  const [filteredId] = id.split('?');
  return filteredId;
}

function forceJSExtension(path: any, id: string) {
  const ext = path.extname(id);
  if (ext === '') {
    return id + '.js';
  }
  if (TRANSFORM_EXTS[ext]) {
    return removeExtension(id) + '.js';
  }
  return id;
}

function removeExtension(id: string) {
  return id.split('.').slice(0, -1).join('.');
}

const TRANSFORM_EXTS: { [ext: string]: boolean } = { '.jsx': true, '.ts': true, '.tsx': true };

export const QWIK_CORE_ID = '@builder.io/qwik';

export const QWIK_BUILD_ID = '@builder.io/qwik/build';

export const QWIK_JSX_RUNTIME_ID = '@builder.io/qwik/jsx-runtime';

export const SRC_DIR_DEFAULT = 'src';

export const MAIN_FILENAME_DEFAULT = 'main.tsx';

export const ENTRY_SERVER_FILENAME_DEFAULT = 'entry.server.tsx';

export interface QwikPluginOptions {
  rootDir?: string;
  distClientDir?: string;
  distServerDir?: string;
  srcDir?: string | null;
  srcInputs?: TransformModuleInput[] | null;
  srcMain?: string;
  srcEntryServer?: string;
  entryStrategy?: EntryStrategy;
  minify?: MinifyMode;
  debug?: boolean;
  symbolsOutput?: ((data: OutputEntryMap, outputOptions: any) => Promise<void> | void) | null;
  isDevBuild?: boolean;
  isSSRBuild?: boolean;
}

export interface NormalizedQwikPluginConfig extends Required<QwikPluginOptions> {}

interface GeneratedOutputBundle {
  fileName: string;
  modules: {
    [id: string]: any;
  };
}
