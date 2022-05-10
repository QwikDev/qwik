import { createOptimizer } from '../optimizer';
import { generateManifestFromBundles, getValidManifest } from '../manifest';
import type {
  Diagnostic,
  EntryStrategy,
  GeneratedOutputBundle,
  GlobalInjections,
  HookAnalysis,
  Optimizer,
  OptimizerOptions,
  QwikManifest,
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
  let addWatchFileCallback: (path: string) => void = () => {};
  let diagnosticsCallback: (d: Diagnostic[], optimizer: Optimizer) => void = () => {};

  const opts: NormalizedQwikPluginConfig = {
    target: 'client',
    buildMode: 'development',
    debug: false,
    rootDir: null as any,
    outClientDir: null as any,
    outServerDir: null as any,
    forceFullBuild: false,
    entryStrategy: null as any,
    srcDir: null as any,
    srcInputs: null as any,
    srcRootInput: null as any,
    srcEntryServerInput: null as any,
    manifestInput: null,
    manifestOutput: null,
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

    if (updatedOpts.target === 'ssr' || updatedOpts.target === 'client') {
      opts.target = updatedOpts.target;
    } else {
      opts.target = 'client';
    }

    if (updatedOpts.buildMode === 'production' || updatedOpts.buildMode === 'development') {
      opts.buildMode = updatedOpts.buildMode;
    } else {
      opts.buildMode = 'development';
    }

    if (updatedOpts.entryStrategy && typeof updatedOpts.entryStrategy === 'object') {
      opts.entryStrategy = { ...updatedOpts.entryStrategy };
    }
    if (!opts.entryStrategy) {
      if (opts.buildMode === 'development') {
        opts.entryStrategy = { type: 'hook' };
      } else {
        opts.entryStrategy = { type: 'smart' };
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

    if (typeof updatedOpts.forceFullBuild === 'boolean') {
      opts.forceFullBuild = updatedOpts.forceFullBuild;
    } else {
      if (opts.buildMode === 'production') {
        opts.forceFullBuild = true;
      } else {
        opts.forceFullBuild = opts.entryStrategy.type !== 'hook' || !!updatedOpts.srcInputs;
      }
    }

    if (opts.forceFullBuild === false && opts.entryStrategy.type !== 'hook') {
      console.error(`forceFullBuild cannot be false with entryStrategy ${opts.entryStrategy.type}`);
      opts.forceFullBuild = true;
    }

    if (opts.forceFullBuild === false && !!updatedOpts.srcInputs) {
      console.error(`forceFullBuild reassigned to "true" since "srcInputs" have been provided`);
      opts.forceFullBuild = true;
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

    const manifestInput = getValidManifest(updatedOpts.manifestInput);
    if (manifestInput) {
      opts.manifestInput = manifestInput;
    }

    if (typeof updatedOpts.manifestOutput === 'function') {
      opts.manifestOutput = updatedOpts.manifestOutput;
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
    log(`buildStart()`, opts.buildMode, opts.forceFullBuild ? 'full build' : 'isolated build');

    if (opts.forceFullBuild) {
      const optimizer = await getOptimizer();

      let rootDir = '/';
      if (typeof opts.srcDir === 'string') {
        rootDir = opts.srcDir;
        log(`buildStart() srcDir`, opts.srcDir);
      } else if (Array.isArray(opts.srcInputs)) {
        optimizer.sys.getInputFiles = async (rootDir) =>
          opts.srcInputs!.map((i) => {
            const relInput: TransformModuleInput = {
              path: optimizer.sys.path.relative(rootDir, i.path),
              code: i.code,
            };
            return relInput;
          });
        log(`buildStart() opts.srcInputs (${opts.srcInputs.length})`);
      }

      log(`transformedOutput.clear()`);
      transformedOutputs.clear();

      const transformOpts: TransformFsOptions = {
        rootDir: rootDir,
        entryStrategy: opts.entryStrategy,
        minify: 'simplify',
        transpile: true,
        explicityExtensions: true,
        dev: opts.buildMode === 'development',
      };

      const result = await optimizer.transformFs(transformOpts);
      for (const output of result.modules) {
        const key = optimizer.sys.path.join(rootDir, output.path)!;
        log(`buildStart() add transformedOutput`, key);
        transformedOutputs.set(key, [output, key]);
      }

      diagnosticsCallback(result.diagnostics, optimizer);

      results.set('@buildStart', result);
    }
  };

  const resolveId = async (
    id: string,
    importer: string | undefined,
    _resolveIdOpts: { ssr?: boolean } = {}
  ) => {
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
        log(`resolveId() Resolved ${tryId} from transformedOutputs`);
        const transformedModule = transformedOutput[0];
        const sideEffects = !transformedModule.isEntry || !transformedModule.hook;
        return {
          id: tryId,
          moduleSideEffects: sideEffects,
        };
      }
      log(`resolveId() id ${tryId} not found in transformedOutputs`);
    }

    return null;
  };

  const load = async (id: string, loadOpts: { ssr?: boolean } = {}) => {
    const optimizer = await getOptimizer();

    if (id === QWIK_BUILD_ID) {
      log(`load()`, QWIK_BUILD_ID, opts.buildMode);
      return {
        code: getBuildTimeModule(opts, loadOpts),
      };
    }

    if (opts.forceFullBuild) {
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
    if (opts.forceFullBuild) {
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

      let path = base;
      if (opts.srcDir) {
        path = optimizer.sys.path.relative(opts.srcDir, pathId);
      }
      const newOutput = optimizer.transformModulesSync({
        input: [
          {
            code,
            path,
          },
        ],
        entryStrategy: { type: 'hook' },
        minify: 'simplify',
        sourceMaps: false,
        transpile: true,
        explicityExtensions: true,
        rootDir: dir,
        dev: opts.buildMode === 'development',
      });

      diagnosticsCallback(newOutput.diagnostics, optimizer);

      results.set(pathId, newOutput);

      for (const [id, output] of results.entries()) {
        const justChanged = newOutput === output;
        const dir = opts.srcDir || optimizer.sys.path.dirname(id);

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
    const outputBundles: GeneratedOutputBundle[] = [];

    const addBundle = (b: GeneratedOutputBundle) => outputBundles.push(b);

    const generateManifest = async () => {
      const optimizer = await getOptimizer();
      const path = optimizer.sys.path;

      const hooks = Array.from(results.values())
        .flatMap((r) => r.modules)
        .map((mod) => mod.hook)
        .filter((h) => !!h) as HookAnalysis[];

      return generateManifestFromBundles(path, hooks, injections, outputBundles);
    };

    return { addBundle, generateManifest };
  };

  const getOptions = () => opts;

  const getTransformedOutputs = () => {
    const to: { [id: string]: TransformModule } = {};
    for (const [v, id] of transformedOutputs.values()) {
      to[id] = v;
    }
    return to;
  };

  const updateSsrManifestDefault = (symbolsStr: string, code: string) => {
    return code.replace(/("|')__QwikManifest__("|')/g, symbolsStr);
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
    updateSsrManifestDefault,
    validateSource,
  };
}

function getBuildTimeModule(pluginOpts: NormalizedQwikPluginConfig, loadOpts: { ssr?: boolean }) {
  const isServer = pluginOpts.target === 'ssr' || !!loadOpts.ssr;
  return `// @builder.io/qwik/build
export const isServer = ${JSON.stringify(isServer)};
export const isBrowser = ${JSON.stringify(!isServer)};
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

export const Q_MANIFEST_FILENAME = 'q-manifest.json';

export interface QwikPluginOptions extends BasePluginOptions {
  rootDir?: string;
  target?: QwikBuildTarget;
  buildMode?: QwikBuildMode;
  forceFullBuild?: boolean;
}

export type QwikBuildTarget = 'client' | 'ssr';

export type QwikBuildMode = 'production' | 'development';

export interface BasePluginOptions {
  debug?: boolean;
  outClientDir?: string;
  outServerDir?: string;
  entryStrategy?: EntryStrategy;
  srcRootInput?: string | string[];
  srcEntryServerInput?: string;
  srcDir?: string | null;
  srcInputs?: TransformModuleInput[] | null;
  manifestInput?: QwikManifest | null;
  manifestOutput?: ((manifest: QwikManifest) => Promise<void> | void) | null;
  transformedModuleOutput?:
    | ((data: { [id: string]: TransformModule }) => Promise<void> | void)
    | null;
}

export interface NormalizedQwikPluginConfig extends Required<QwikPluginOptions> {
  srcRootInput: string[];
}
