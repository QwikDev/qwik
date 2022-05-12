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

  const opts: NormalizedQwikPluginOptions = {
    target: 'client',
    buildMode: 'development',
    debug: false,
    rootDir: null as any,
    client: null as any,
    ssr: null as any,
    forceFullBuild: false,
    entryStrategy: null as any,
    srcDir: null as any,
    srcInputs: null as any,
    transformedModuleOutput: null,
  };

  const getOptimizer = async () => {
    if (!optimizer) {
      optimizer = await createOptimizer(optimizerOptions);
    }
    return optimizer;
  };

  const normalizeOptions = async (inputOpts?: QwikPluginOptions) => {
    const updatedOpts: NormalizedQwikPluginOptions = Object.assign({}, inputOpts) as any;

    const optimizer = await getOptimizer();
    const path = optimizer.sys.path;

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
    opts.rootDir = normalizePath(path.resolve(optimizer.sys.cwd(), opts.rootDir));

    let srcDir = normalizePath(path.resolve(opts.rootDir, SRC_DIR_DEFAULT));
    if (typeof updatedOpts.srcDir === 'string') {
      opts.srcDir = normalizePath(path.resolve(opts.rootDir, updatedOpts.srcDir));
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
        i.path = normalizePath(path.resolve(opts.rootDir, i.path));
      });
    } else if (typeof opts.srcDir === 'string') {
      opts.srcDir = normalizePath(path.resolve(opts.rootDir, opts.srcDir));
    }

    // Client Input
    updatedOpts.client = updatedOpts.client || {};
    opts.client = opts.client || {};
    if (typeof updatedOpts.client.input === 'string') {
      opts.client.input = [updatedOpts.client.input];
    } else if (Array.isArray(updatedOpts.client.input)) {
      opts.client.input = [...updatedOpts.client.input];
    } else {
      opts.client.input = [path.resolve(srcDir, 'components', 'app', 'app.tsx')];
    }
    opts.client.input = opts.client.input.map((i) => {
      return normalizePath(path.resolve(opts.rootDir, i));
    });
    if (typeof updatedOpts.client.manifestOutput === 'function') {
      opts.client.manifestOutput = updatedOpts.client.manifestOutput;
    } else {
      opts.client.manifestOutput = null;
    }

    // Client Output
    if (typeof updatedOpts.client.outDir === 'string') {
      opts.client.outDir = normalizePath(path.resolve(opts.rootDir, updatedOpts.client.outDir));
    } else {
      opts.client.outDir = normalizePath(path.resolve(opts.rootDir, CLIENT_OUT_DIR));
    }

    // SSR Input
    updatedOpts.ssr = updatedOpts.ssr || {};
    opts.ssr = opts.ssr || {};
    if (typeof updatedOpts.ssr.input === 'string') {
      opts.ssr.input = normalizePath(path.resolve(opts.rootDir, updatedOpts.ssr.input));
    } else {
      opts.ssr.input = normalizePath(path.resolve(srcDir, ENTRY_SERVER_FILENAME_DEFAULT));
    }
    if (typeof updatedOpts.ssr.renderInput === 'string') {
      opts.ssr.renderInput = normalizePath(path.resolve(opts.rootDir, updatedOpts.ssr.renderInput));
    } else {
      opts.ssr.renderInput = normalizePath(path.resolve(srcDir, ENTRY_SSR_FILENAME_DEFAULT));
    }
    const clientManifest = getValidManifest(updatedOpts.ssr.manifestInput);
    if (clientManifest) {
      opts.ssr.manifestInput = clientManifest;
    } else {
      opts.ssr.manifestInput = null;
    }

    // SSR Output
    if (typeof updatedOpts.ssr.outDir === 'string') {
      opts.ssr.outDir = normalizePath(path.resolve(opts.rootDir, updatedOpts.ssr.outDir));
    } else {
      opts.ssr.outDir = normalizePath(path.resolve(opts.rootDir, SSR_OUT_DIR));
    }

    return { ...opts };
  };

  const validateSource = async () => {
    const optimizer = await getOptimizer();
    if (optimizer.sys.env === 'node') {
      const fs: typeof import('fs') = await optimizer.sys.dynamicImport('fs');
      if (!fs.existsSync(opts.rootDir)) {
        throw new Error(`Qwik rootDir "${opts.rootDir}" not found`);
      }
      if (typeof opts.srcDir === 'string' && !fs.existsSync(opts.srcDir)) {
        throw new Error(`Qwik srcDir "${opts.srcDir}" not found`);
      }
      opts.client.input.forEach((input) => {
        if (!fs.existsSync(input)) {
          throw new Error(`Qwik client.input "${input}" not found`);
        }
      });
      if (!fs.existsSync(opts.ssr.input)) {
        throw new Error(`Qwik ssr.input "${opts.ssr.input}" not found`);
      }
      if (!fs.existsSync(opts.ssr.renderInput)) {
        throw new Error(`Qwik ssr.renderInput "${opts.ssr.renderInput}" not found`);
      }
    }
  };

  const buildStart = async () => {
    log(`buildStart()`, opts.buildMode, opts.forceFullBuild ? 'full build' : 'isolated build');

    if (opts.forceFullBuild) {
      const optimizer = await getOptimizer();

      let rootDir = '/';
      if (typeof opts.srcDir === 'string') {
        rootDir = normalizePath(opts.srcDir);
        log(`buildStart() srcDir`, opts.srcDir);
      } else if (Array.isArray(opts.srcInputs)) {
        optimizer.sys.getInputFiles = async (rootDir) =>
          opts.srcInputs!.map((i) => {
            const relInput: TransformModuleInput = {
              path: normalizePath(optimizer.sys.path.relative(rootDir, i.path)),
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
        const key = normalizePath(optimizer.sys.path.join(rootDir, output.path)!);
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
    const optimizer = await getOptimizer();

    if (id === QWIK_BUILD_ID || id.endsWith(QWIK_BUILD_RESOLVED_ID)) {
      log(`resolveId()`, 'Resolved', QWIK_BUILD_ID);
      return {
        id: optimizer.sys.path.resolve(opts.rootDir, QWIK_BUILD_RESOLVED_ID),
        moduleSideEffects: false,
      };
    }

    const parsedId = parseId(id);
    let importeePathId = normalizePath(parsedId.pathId);

    if (importer) {
      importer = normalizePath(importer);
      log(`resolveId("${importeePathId}", "${importer}")`);
      const parsedImporterId = parseId(importer);
      const dir = optimizer.sys.path.dirname(parsedImporterId.pathId);
      if (parsedImporterId.pathId.endsWith('.html') && !importeePathId.endsWith('.html')) {
        importeePathId = normalizePath(optimizer.sys.path.join(dir, importeePathId));
      } else {
        importeePathId = normalizePath(optimizer.sys.path.resolve(dir, importeePathId));
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
    if (id.endsWith(QWIK_BUILD_RESOLVED_ID)) {
      log(`load()`, QWIK_BUILD_ID, opts.buildMode);
      return {
        code: await getQwikBuildModule(loadOpts),
      };
    }

    const optimizer = await getOptimizer();
    id = normalizePath(id);
    if (opts.forceFullBuild) {
      // On full build, lets normalize the ID
      id = forceJSExtension(optimizer.sys.path, id);
    }

    const transformedModule = transformedOutputs.get(id);
    if (transformedModule) {
      log(`load()`, 'Found', id);

      let code = transformedModule[0].code;
      if (opts.target === 'ssr') {
        code = code.replace(
          /@builder.io\/qwik\/build/g,
          optimizer.sys.path.resolve(opts.rootDir, QWIK_BUILD_RESOLVED_ID)
        );
      }

      return {
        code,
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

    id = normalizePath(id);
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
      path = normalizePath(path);
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
        rootDir: normalizePath(dir),
        dev: opts.buildMode === 'development',
      });

      diagnosticsCallback(newOutput.diagnostics, optimizer);

      results.set(normalizePath(pathId), newOutput);

      for (const [id, output] of results.entries()) {
        const justChanged = newOutput === output;
        const dir = normalizePath(opts.srcDir || optimizer.sys.path.dirname(id));

        for (const mod of output.modules) {
          if (mod.isEntry) {
            const key = normalizePath(optimizer.sys.path.join(dir, mod.path));
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

      return generateManifestFromBundles(path, hooks, injections, outputBundles, opts);
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

  const normalizePath = (id: string) => {
    if (typeof id === 'string') {
      if (optimizer) {
        if (optimizer.sys.os === 'win32') {
          // MIT https://github.com/sindresorhus/slash/blob/main/license
          // Convert Windows backslash paths to slash paths: foo\\bar ➔ foo/bar
          const isExtendedLengthPath = /^\\\\\?\\/.test(id);
          if (!isExtendedLengthPath) {
            const hasNonAscii = /[^\u0000-\u0080]+/.test(id); // eslint-disable-line no-control-regex
            if (!hasNonAscii) {
              id = id.replace(/\\/g, '/');
            }
          }
          // windows normalize
          return optimizer.sys.path.posix.normalize(id);
        }
        // posix normalize
        return optimizer.sys.path.normalize(id);
      }
      throw new Error(`Cannot normalizePath("${id}"), Optimizer sys.path has not been initialized`);
    }
    return id;
  };

  async function getQwikBuildModule(loadOpts: { ssr?: boolean }) {
    const isServer = opts.target === 'ssr' || !!loadOpts.ssr;

    const optimizer = await getOptimizer();
    let manifest: QwikManifest | null = null;
    if (isServer) {
      manifest = opts.ssr.manifestInput;

      if (!manifest && optimizer.sys.env === 'node') {
        // manifest not provided, and in a nodejs environment
        try {
          // check if we can find q-manifest.json from the client build
          const fs: typeof import('fs') = await optimizer.sys.dynamicImport('fs');
          const qSymbolsPath = optimizer.sys.path.join(opts.client.outDir, Q_MANIFEST_FILENAME);
          const qSymbolsContent = fs.readFileSync(qSymbolsPath, 'utf-8');
          manifest = getValidManifest(JSON.parse(qSymbolsContent))!;
        } catch (e) {
          /** */
        }
      }
    }

    return `// @builder.io/qwik/build
export const isServer = ${JSON.stringify(isServer)};
export const isBrowser = ${JSON.stringify(!isServer)};
export const manifest = ${JSON.stringify(manifest)};
`;
  }

  return {
    buildStart,
    createOutputAnalyzer,
    getQwikBuildModule,
    getOptimizer,
    getOptions,
    getTransformedOutputs,
    load,
    log,
    normalizeOptions,
    normalizePath,
    onAddWatchFile,
    onDiagnostics,
    resolveId,
    transform,
    validateSource,
  };
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

export const QWIK_BUILD_RESOLVED_ID = '@builder.io-qwik-build';

export const QWIK_JSX_RUNTIME_ID = '@builder.io/qwik/jsx-runtime';

export const SRC_DIR_DEFAULT = 'src';

export const ENTRY_SERVER_FILENAME_DEFAULT = 'entry.server.tsx';

export const ENTRY_SSR_FILENAME_DEFAULT = 'entry.ssr.tsx';

const CLIENT_OUT_DIR = 'dist';

const SSR_OUT_DIR = 'server';

export const Q_MANIFEST_FILENAME = 'q-manifest.json';

export interface QwikPluginOptions {
  buildMode?: QwikBuildMode;
  debug?: boolean;
  entryStrategy?: EntryStrategy;
  forceFullBuild?: boolean;
  rootDir?: string;
  client?: {
    input?: string[] | string;
    outDir?: string;
    manifestOutput?: ((manifest: QwikManifest) => Promise<void> | void) | null;
  };
  ssr?: {
    input?: string;
    renderInput?: string;
    outDir?: string;
    manifestInput?: QwikManifest | null;
  };
  srcDir?: string | null;
  srcInputs?: TransformModuleInput[] | null;
  target?: QwikBuildTarget;
  transformedModuleOutput?:
    | ((data: { [id: string]: TransformModule }) => Promise<void> | void)
    | null;
}

export interface NormalizedQwikPluginOptions extends Required<QwikPluginOptions> {
  client: {
    input: string[];
    outDir: string;
    manifestOutput: ((manifest: QwikManifest) => Promise<void> | void) | null;
  };
  ssr: {
    input: string;
    renderInput: string;
    outDir: string;
    manifestInput: QwikManifest | null;
  };
}

export type QwikBuildTarget = 'client' | 'ssr';

export type QwikBuildMode = 'production' | 'development';
