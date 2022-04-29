import { createOptimizer } from '../optimizer';
import type {
  Diagnostic,
  EntryStrategy,
  GlobalInjections,
  HookAnalysis,
  MinifyMode,
  Optimizer,
  OptimizerOptions,
  SymbolsEntryMap,
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
    outClientDir: null as any,
    outServerDir: null as any,
    isDevBuild: true,
    buildMode: 'client',
    entryStrategy: null as any,
    minify: null as any,
    srcDir: null as any,
    srcInputs: null as any,
    srcRootInput: null as any,
    srcEntryServerInput: null as any,
    symbolsInput: null,
    symbolsOutput: null,
    transformedModuleOutput: null,
  };

  const getOptimizer = async () => {
    if (!optimizer) {
      optimizer = await createOptimizer(optimizerOptions);
    }
    return optimizer;
  };

  const normalizeOptions = async (inputOpts?: QwikPluginOptions) => {
    const updatedOpts: NormalizedQwikPluginConfig = Object.assign({}, inputOpts) as any;

    const optimizer = await getOptimizer();

    opts.debug = !!updatedOpts.debug;
    opts.isDevBuild = !!updatedOpts.isDevBuild;
    opts.buildMode = updatedOpts.buildMode === 'ssr' ? 'ssr' : 'client';

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
    }
    opts.rootDir = optimizer.sys.path.resolve(optimizer.sys.cwd(), opts.rootDir);

    let srcDir = optimizer.sys.path.resolve(opts.rootDir, SRC_DIR_DEFAULT);
    if (typeof updatedOpts.srcDir === 'string') {
      opts.srcDir = optimizer.sys.path.resolve(opts.rootDir, updatedOpts.srcDir);
      srcDir = opts.srcDir;
      opts.srcInputs = null;
    } else if (Array.isArray(updatedOpts.srcInputs)) {
      opts.srcInputs = [...updatedOpts.srcInputs];
      opts.srcDir = null;
    } else {
      opts.srcDir = srcDir;
    }

    if (Array.isArray(opts.srcInputs)) {
      opts.srcInputs.forEach((i) => {
        i.path = optimizer.sys.path.resolve(opts.rootDir, i.path);
      });
    } else if (typeof opts.srcDir === 'string') {
      opts.srcDir = optimizer.sys.path.resolve(opts.rootDir, opts.srcDir);
    }

    if (typeof updatedOpts.srcRootInput === 'string') {
      opts.srcRootInput = [updatedOpts.srcRootInput];
    } else if (Array.isArray(updatedOpts.srcRootInput)) {
      opts.srcRootInput = [...updatedOpts.srcRootInput];
    } else {
      opts.srcRootInput = [ROOT_FILENAME_DEFAULT];
    }

    opts.srcRootInput = opts.srcRootInput.map((p) => {
      return optimizer.sys.path.resolve(srcDir, p);
    });

    if (typeof updatedOpts.srcEntryServerInput === 'string') {
      opts.srcEntryServerInput = optimizer.sys.path.resolve(
        srcDir,
        updatedOpts.srcEntryServerInput
      );
    } else {
      opts.srcEntryServerInput = optimizer.sys.path.resolve(srcDir, ENTRY_SERVER_FILENAME_DEFAULT);
    }

    if (typeof updatedOpts.outClientDir === 'string') {
      opts.outClientDir = updatedOpts.outClientDir;
    }
    if (typeof opts.outClientDir !== 'string') {
      opts.outClientDir = DIST_DIR_DEFAULT;
    }
    opts.outClientDir = optimizer.sys.path.resolve(opts.rootDir, opts.outClientDir);

    if (typeof updatedOpts.outServerDir === 'string') {
      opts.outServerDir = updatedOpts.outServerDir;
    }
    if (typeof opts.outServerDir !== 'string') {
      opts.outServerDir = SERVER_DIR_DEFAULT;
    }
    opts.outServerDir = optimizer.sys.path.resolve(opts.rootDir, opts.outServerDir);

    if (
      updatedOpts.symbolsInput &&
      typeof updatedOpts.symbolsInput === 'object' &&
      typeof updatedOpts.symbolsInput.mapping === 'object'
    ) {
      opts.symbolsInput = updatedOpts.symbolsInput;
    }

    if (typeof updatedOpts.symbolsOutput === 'function') {
      opts.symbolsOutput = updatedOpts.symbolsOutput;
    }

    return { ...opts };
  };

  const validateSource = async () => {
    const optimizer = await getOptimizer();
    if (optimizer.sys.env() === 'node') {
      const fs: typeof import('fs') = await optimizer.sys.dynamicImport('fs');
      if (!fs.existsSync(opts.rootDir)) {
        throw new Error(`Qwik rootDir "${opts.rootDir}" not found`);
      }
      if (typeof opts.srcDir === 'string' && !fs.existsSync(opts.srcDir)) {
        throw new Error(`Qwik srcDir "${opts.srcDir}" not found`);
      }
      if (!fs.existsSync(opts.srcEntryServerInput)) {
        throw new Error(`Qwik srcEntryServerInput "${opts.srcEntryServerInput}" not found`);
      }
      opts.srcRootInput.forEach((input) => {
        if (!fs.existsSync(input)) {
          throw new Error(`Qwik srcRootInput "${input}" not found`);
        }
      });
    }
  };

  const buildStart = async () => {
    const isFullBuild = opts.entryStrategy?.type !== 'hook';

    log(`buildStart()`, opts.buildMode, isFullBuild ? 'full build' : 'isolated build');

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

    const optimizer = await getOptimizer();

    const parsedId = parseId(id);
    let importeePathId = parsedId.pathId;

    if (importer) {
      log(`resolveId("${importeePathId}", "${importer}")`);
      const parsedImporterId = parseId(importer);
      const dir = optimizer.sys.path.dirname(parsedImporterId.pathId);
      if (parsedImporterId.pathId.endsWith('.html') && !importeePathId.endsWith('.html')) {
        importeePathId = optimizer.sys.path.join(dir, importeePathId);
      } else {
        importeePathId = optimizer.sys.path.resolve(dir, importeePathId);
      }
    } else {
      log(`resolveId("${importeePathId}"), No importer`);
    }

    const tryImportPathIds = [forceJSExtension(optimizer.sys.path, importeePathId)];
    for (const tryId of tryImportPathIds) {
      const transformedOutput = transformedOutputs.get(tryId);
      if (transformedOutput) {
        log(`resolveId() Resolved ${tryId}`);
        const transformedModule = transformedOutput[0];
        const sideEffects = !transformedModule.isEntry || !transformedModule.hook;
        return {
          id: tryId,
          moduleSideEffects: sideEffects,
        };
      } else {
        log(`resolveId() Resolved not found ${tryId}`);
      }
    }

    return null;
  };

  const load = async (id: string) => {
    const optimizer = await getOptimizer();

    if (id === QWIK_BUILD_ID) {
      log(`load()`, QWIK_BUILD_ID, opts.buildMode);
      return {
        code: getBuildTimeModule(opts),
      };
    }

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

    const { pathId } = parseId(id);
    const { ext, dir, base } = optimizer.sys.path.parse(pathId);

    if (TRANSFORM_EXTS[ext]) {
      log(`transform()`, 'Transforming', pathId);

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

      results.set(pathId, newOutput);

      // transformedOutputs.clear();

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

    const generateSymbolsEntryMap = async () => {
      const optimizer = await getOptimizer();
      const symbolsEntryMap: SymbolsEntryMap = {
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
          let basename = h.canonicalFilename + '.js';

          const found = bundles.find((b) => {
            return Object.keys(b.modules).find((f) => f.endsWith(basename));
          });

          if (found) {
            basename = found.fileName;
          }

          basename = optimizer.sys.path.basename(basename);

          symbolsEntryMap.mapping[symbolName] = basename;
        });
      }

      log(`generateSymbolsEntryMap()`, symbolsEntryMap);

      return symbolsEntryMap;
    };

    return { addBundle, generateSymbolsEntryMap };
  };

  const getOptions = () => ({ ...opts });

  const getTransformedOutputs = () => {
    const to: { [id: string]: TransformModule } = {};
    for (const [v, id] of transformedOutputs.values()) {
      to[id] = v;
    }
    return to;
  };

  const updateSymbolsEntryMap = (symbolsStr: string, code: string) => {
    return code.replace(/("|')__qSymbolsEntryMap__("|')/g, symbolsStr);
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
    updateSymbolsEntryMap,
    validateSource,
  };
}

function getBuildTimeModule(opts: NormalizedQwikPluginConfig) {
  return `
export const isServer = ${opts.buildMode === 'ssr'};
export const isBrowser = ${opts.buildMode === 'client'};
`;
}

export function parseId(originalId: string) {
  const [pathId, querystrings] = originalId.split('?');
  return {
    originalId,
    pathId,
    params: new URLSearchParams(querystrings || ''),
  };
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

export const ROOT_FILENAME_DEFAULT = 'root.tsx';

export const ENTRY_SERVER_FILENAME_DEFAULT = 'entry.server.tsx';

const DIST_DIR_DEFAULT = 'dist';

const SERVER_DIR_DEFAULT = 'server';

export const SYMBOLS_MANIFEST_FILENAME = 'symbols-manifest.json';

export interface QwikPluginOptions extends BasePluginOptions {
  rootDir?: string;
  isDevBuild?: boolean;
  buildMode?: QwikBuildMode;
}

export type QwikBuildMode = 'client' | 'ssr';

export interface BasePluginOptions {
  debug?: boolean;
  outClientDir?: string;
  outServerDir?: string;
  entryStrategy?: EntryStrategy;
  minify?: MinifyMode;
  srcRootInput?: string | string[];
  srcEntryServerInput?: string;
  srcDir?: string | null;
  srcInputs?: TransformModuleInput[] | null;
  symbolsInput?: SymbolsEntryMap | null;
  symbolsOutput?: ((symbolsEntryMap: SymbolsEntryMap) => Promise<void> | void) | null;
  transformedModuleOutput?:
    | ((data: { [id: string]: TransformModule }) => Promise<void> | void)
    | null;
}

export interface NormalizedQwikPluginConfig extends Required<QwikPluginOptions> {
  srcRootInput: string[];
}

interface GeneratedOutputBundle {
  fileName: string;
  modules: {
    [id: string]: any;
  };
}
