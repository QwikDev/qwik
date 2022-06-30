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

export interface QwikPackages {
  id: string;
  path: string;
}

export function createPlugin(optimizerOptions: OptimizerOptions = {}) {
  const id = `${Math.round(Math.random() * 899) + 100}`;
  const results = new Map<string, TransformOutput>();
  const transformedOutputs = new Map<string, [TransformModule, string]>();

  let internalOptimizer: Optimizer | null = null;
  let addWatchFileCallback: (ctx: any, path: string) => void = () => {};
  let diagnosticsCallback: (d: Diagnostic[], optimizer: Optimizer) => void = () => {};

  const opts: NormalizedQwikPluginOptions = {
    target: 'client',
    buildMode: 'development',
    format: 'es',
    debug: false,
    rootDir: null as any,
    input: null as any,
    outDir: null as any,
    resolveQwikBuild: false,
    forceFullBuild: false,
    entryStrategy: null as any,
    srcDir: null as any,
    srcInputs: null as any,
    manifestInput: null,
    manifestOutput: null,
    transformedModuleOutput: null,
    vendorRoots: [],
    scope: null,
  };

  const init = async () => {
    if (!internalOptimizer) {
      internalOptimizer = await createOptimizer(optimizerOptions);
    }
  };

  const getOptimizer = () => {
    if (!internalOptimizer) {
      throw new Error(`Qwik plugin has not been initialized`);
    }
    return internalOptimizer;
  };

  const getSys = () => {
    const optimizer = getOptimizer();
    return optimizer.sys;
  };

  const getPath = () => {
    const optimizer = getOptimizer();
    return optimizer.sys.path;
  };

  const normalizeOptions = (inputOpts?: QwikPluginOptions) => {
    const updatedOpts: QwikPluginOptions = Object.assign({}, inputOpts);

    const optimizer = getOptimizer();
    const path = optimizer.sys.path;

    opts.debug = !!updatedOpts.debug;

    if (
      updatedOpts.target === 'ssr' ||
      updatedOpts.target === 'client' ||
      updatedOpts.target === 'lib'
    ) {
      opts.target = updatedOpts.target;
    } else {
      opts.target = 'client';
    }

    if (opts.target === 'lib') {
      opts.buildMode = 'development';
    } else if (updatedOpts.buildMode === 'production' || updatedOpts.buildMode === 'development') {
      opts.buildMode = updatedOpts.buildMode;
    } else {
      opts.buildMode = 'development';
    }

    if (updatedOpts.entryStrategy && typeof updatedOpts.entryStrategy === 'object') {
      opts.entryStrategy = { ...updatedOpts.entryStrategy };
    }
    if (!opts.entryStrategy) {
      if (opts.target === 'ssr' || opts.target === 'lib') {
        opts.entryStrategy = { type: 'inline' };
      } else {
        if (opts.buildMode === 'production') {
          opts.entryStrategy = { type: 'smart' };
        } else {
          opts.entryStrategy = { type: 'hook' };
        }
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
      opts.forceFullBuild =
        (opts.entryStrategy.type !== 'hook' && opts.entryStrategy.type !== 'inline') ||
        !!updatedOpts.srcInputs;
    }

    if (
      opts.forceFullBuild === false &&
      opts.entryStrategy.type !== 'hook' &&
      opts.entryStrategy.type !== 'inline'
    ) {
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
      opts.srcDir = normalizePath(path.resolve(opts.rootDir, normalizePath(opts.srcDir)));
    }

    if (Array.isArray(updatedOpts.input)) {
      opts.input = updatedOpts.input;
    } else if (typeof updatedOpts.input === 'string') {
      opts.input = [updatedOpts.input];
    } else {
      if (opts.target === 'ssr') {
        // ssr input default
        opts.input = [path.resolve(srcDir, 'entry.ssr.tsx')];
      } else if (opts.target === 'client') {
        // client input default
        opts.input = [path.resolve(srcDir, 'root.tsx')];
      } else if (opts.target === 'lib') {
        // lib input default
        opts.input = [path.resolve(srcDir, 'index.ts')];
      }
    }
    opts.input = opts.input.map((input) => {
      return normalizePath(path.resolve(opts.rootDir, input));
    });

    if (typeof updatedOpts.outDir === 'string') {
      opts.outDir = normalizePath(path.resolve(opts.rootDir, normalizePath(updatedOpts.outDir)));
    } else {
      if (opts.target === 'ssr') {
        opts.outDir = normalizePath(path.resolve(opts.rootDir, SSR_OUT_DIR));
      } else if (opts.target === 'lib') {
        opts.outDir = normalizePath(path.resolve(opts.rootDir, LIB_OUT_DIR));
      } else {
        opts.outDir = normalizePath(path.resolve(opts.rootDir, CLIENT_OUT_DIR));
      }
    }

    if (typeof updatedOpts.manifestOutput === 'function') {
      opts.manifestOutput = updatedOpts.manifestOutput;
    }

    const clientManifest = getValidManifest(updatedOpts.manifestInput);
    if (clientManifest) {
      opts.manifestInput = clientManifest;
    }

    if (typeof updatedOpts.transformedModuleOutput === 'function') {
      opts.transformedModuleOutput = updatedOpts.transformedModuleOutput;
    }

    opts.vendorRoots = updatedOpts.vendorRoots ? updatedOpts.vendorRoots : [];
    opts.scope = updatedOpts.scope ?? null;

    return { ...opts };
  };

  let hasValidatedSource = false;

  const validateSource = async () => {
    if (!hasValidatedSource) {
      hasValidatedSource = true;

      const sys = getSys();
      if (sys.env === 'node') {
        const fs: typeof import('fs') = await sys.dynamicImport('fs');
        if (!fs.existsSync(opts.rootDir)) {
          throw new Error(`Qwik rootDir "${opts.rootDir}" not found.`);
        }
        if (typeof opts.srcDir === 'string' && !fs.existsSync(opts.srcDir)) {
          throw new Error(`Qwik srcDir "${opts.srcDir}" not found.`);
        }
        for (const alias in opts.input) {
          const input = opts.input[alias];
          if (!fs.existsSync(input)) {
            throw new Error(`Qwik input "${input}" not found.`);
          }
        }
      }
    }
  };

  const buildStart = async (_ctx: any) => {
    log(
      `buildStart()`,
      opts.buildMode,
      opts.forceFullBuild ? 'full build' : 'isolated build',
      opts.scope
    );

    if (opts.forceFullBuild) {
      const optimizer = getOptimizer();
      const path = getPath();

      let srcDir = '/';
      if (typeof opts.srcDir === 'string') {
        srcDir = normalizePath(opts.srcDir);
        log(`buildStart() srcDir`, opts.srcDir);
      } else if (Array.isArray(opts.srcInputs)) {
        optimizer.sys.getInputFiles = async (rootDir) =>
          opts.srcInputs!.map((i) => {
            const relInput: TransformModuleInput = {
              path: normalizePath(path.relative(rootDir, i.path)),
              code: i.code,
            };
            return relInput;
          });
        log(`buildStart() opts.srcInputs (${opts.srcInputs.length})`);
      }
      const vendorRoots = opts.vendorRoots;
      if (vendorRoots.length > 0) {
        log(`vendorRoots`, vendorRoots);
      }

      log(`transformedOutput.clear()`);
      transformedOutputs.clear();

      const transformOpts: TransformFsOptions = {
        srcDir,
        vendorRoots,
        entryStrategy: opts.entryStrategy,
        minify: 'simplify',
        transpile: true,
        explicitExtensions: true,
        dev: opts.buildMode === 'development',
        scope: opts.scope ? opts.scope : undefined,
      };

      const result = await optimizer.transformFs(transformOpts);
      for (const output of result.modules) {
        const key = normalizePath(path.join(srcDir, output.path)!);
        log(`buildStart() add transformedOutput`, key);
        transformedOutputs.set(key, [output, key]);
      }

      diagnosticsCallback(result.diagnostics, optimizer);

      results.set('@buildStart', result);
    }
  };

  const resolveId = async (
    _ctx: any,
    id: string,
    importer: string | undefined,
    _resolveIdOpts?: { ssr?: boolean }
  ) => {
    const path = getPath();
    if (opts.target === 'lib' && id.startsWith(QWIK_CORE_ID)) {
      return {
        external: true,
        id,
      };
    }

    if (opts.resolveQwikBuild && id === QWIK_BUILD_ID) {
      log(`resolveId()`, 'Resolved', QWIK_BUILD_ID);
      return {
        id: normalizePath(path.resolve(opts.rootDir, QWIK_BUILD_ID)),
        moduleSideEffects: false,
      };
    }

    if (id.endsWith(QWIK_CLIENT_MANIFEST_ID)) {
      log(`resolveId()`, 'Resolved', QWIK_CLIENT_MANIFEST_ID);
      if (opts.target === 'lib') {
        return {
          id: id,
          external: true,
          moduleSideEffects: false,
        };
      }
      return {
        id: normalizePath(path.resolve(opts.input[0], QWIK_CLIENT_MANIFEST_ID)),
        moduleSideEffects: false,
      };
    }

    const parsedId = parseId(id);
    let importeePathId = normalizePath(parsedId.pathId);

    if (importer) {
      importer = normalizePath(importer);
      log(`resolveId("${importeePathId}", "${importer}")`);
      const parsedImporterId = parseId(importer);
      const dir = path.dirname(parsedImporterId.pathId);
      if (parsedImporterId.pathId.endsWith('.html') && !importeePathId.endsWith('.html')) {
        importeePathId = normalizePath(path.join(dir, importeePathId));
      } else {
        importeePathId = normalizePath(path.resolve(dir, importeePathId));
      }
    } else {
      log(`resolveId("${importeePathId}"), No importer`);
    }

    const tryImportPathIds = [forceJSExtension(importeePathId, path.extname(importeePathId))];
    for (const tryId of tryImportPathIds) {
      const transformedOutput = transformedOutputs.get(tryId);
      if (transformedOutput) {
        log(`resolveId() Resolved ${tryId} from transformedOutputs`);
        return {
          id: tryId + parsedId.query,
          moduleSideEffects: false,
        };
      }
      log(`resolveId() id ${tryId} not found in transformedOutputs`);
    }

    return null;
  };

  const load = async (_ctx: any, id: string, loadOpts: { ssr?: boolean } = {}) => {
    if (opts.resolveQwikBuild && id.endsWith(QWIK_BUILD_ID)) {
      log(`load()`, QWIK_BUILD_ID, opts.buildMode);
      return {
        moduleSideEffects: false,
        code: getQwikBuildModule(loadOpts),
      };
    }

    if (id.endsWith(QWIK_CLIENT_MANIFEST_ID)) {
      log(`load()`, QWIK_CLIENT_MANIFEST_ID, opts.buildMode);
      return {
        moduleSideEffects: false,
        code: await getQwikServerManifestModule(loadOpts),
      };
    }
    const parsedId = parseId(id);
    const path = getPath();
    id = normalizePath(parsedId.pathId);
    if (opts.forceFullBuild) {
      // On full build, lets normalize the ID
      id = forceJSExtension(id, path.extname(id));
    }

    const transformedModule = transformedOutputs.get(id);
    if (transformedModule) {
      log(`load()`, 'Found', id);

      let code = transformedModule[0].code;
      if (opts.target === 'ssr') {
        // doing this because vite will not use resolveId() when "noExternal" is false
        // so we need to turn the @qwik-client-manifest import into a relative import
        code = code.replace(
          /@qwik-client-manifest/g,
          normalizePath(path.resolve(opts.input[0], QWIK_CLIENT_MANIFEST_ID))
        );
      }

      return {
        code,
        map: transformedModule[0].map,
        moduleSideEffects: false,
      };
    }

    log(`load()`, 'Not Found', id);

    return null;
  };

  const transform = function (ctx: any, code: string, id: string) {
    if (opts.forceFullBuild) {
      // Only run when moduleIsolated === true
      return null;
    }

    const optimizer = getOptimizer();
    const path = getPath();

    const { pathId } = parseId(id);
    const { ext, dir, base } = path.parse(pathId);

    const normalizedID = normalizePath(pathId);
    const pregenerated = transformedOutputs.get(normalizedID);
    if (pregenerated) {
      log(`transform() pregenerated, addWatchFile`, normalizedID, pregenerated[1]);
      addWatchFileCallback(ctx, pregenerated[1]);

      return {
        moduleSideEffects: false,
        meta: {
          hook: pregenerated[0].hook,
        },
      };
    }

    if (TRANSFORM_EXTS[ext] || TRANSFORM_REGEX.test(pathId)) {
      log(`transform()`, 'Transforming', pathId);

      let filePath = base;
      if (opts.srcDir) {
        filePath = path.relative(opts.srcDir, pathId);
      }
      filePath = normalizePath(filePath);
      const newOutput = optimizer.transformModulesSync({
        input: [
          {
            code,
            path: filePath,
          },
        ],
        entryStrategy: opts.entryStrategy,
        minify: 'simplify',
        sourceMaps: false,
        transpile: true,
        explicitExtensions: true,
        srcDir: opts.srcDir ? opts.srcDir : normalizePath(dir),
        dev: opts.buildMode === 'development',
        scope: opts.scope ? opts.scope : undefined,
      });

      diagnosticsCallback(newOutput.diagnostics, optimizer);

      results.set(normalizePath(pathId), newOutput);

      for (const [id, output] of results.entries()) {
        const justChanged = newOutput === output;
        const dir = normalizePath(opts.srcDir || path.dirname(id));

        for (const mod of output.modules) {
          if (mod.isEntry) {
            const key = normalizePath(path.join(dir, mod.path));
            transformedOutputs.set(key, [mod, id]);

            log(`transform()`, 'emitting', justChanged, key);
          }
        }
      }

      const module = newOutput.modules.find((m) => !m.isEntry)!;
      return {
        code: module.code,
        map: module.map,
        moduleSideEffects: false,
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
    const injections: GlobalInjections[] = [];

    const addBundle = (b: GeneratedOutputBundle) => outputBundles.push(b);
    const addInjection = (b: GlobalInjections) => injections.push(b);
    const generateManifest = async () => {
      const optimizer = getOptimizer();
      const path = optimizer.sys.path;

      const hooks = Array.from(results.values())
        .flatMap((r) => r.modules)
        .map((mod) => mod.hook)
        .filter((h) => !!h) as HookAnalysis[];

      return generateManifestFromBundles(path, hooks, injections, outputBundles, opts);
    };

    return { addBundle, addInjection, generateManifest };
  };

  const getOptions = () => opts;

  const getTransformedOutputs = () => {
    return Array.from(transformedOutputs.values()).map((t) => {
      return t[0];
    });
  };

  const log = (...str: any[]) => {
    if (opts.debug) {
      // eslint-disable-next-line no-console
      console.debug(`[QWIK PLUGIN: ${id}]`, ...str);
    }
  };

  const onAddWatchFile = (cb: (ctx: any, path: string) => void) => {
    addWatchFileCallback = cb;
  };

  const onDiagnostics = (cb: (d: Diagnostic[], optimizer: Optimizer) => void) => {
    diagnosticsCallback = cb;
  };

  const normalizePath = (id: string) => {
    if (typeof id === 'string') {
      const sys = getSys();
      if (sys.os === 'win32') {
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
        return sys.path.posix.normalize(id);
      }
      // posix normalize
      return sys.path.normalize(id);
    }
    return id;
  };

  function getQwikBuildModule(loadOpts: { ssr?: boolean }) {
    const isServer = opts.target === 'ssr' || !!loadOpts.ssr;
    return `// @builder.io/qwik/build
export const isServer = ${JSON.stringify(isServer)};
export const isBrowser = ${JSON.stringify(!isServer)};
`;
  }

  async function getQwikServerManifestModule(loadOpts: { ssr?: boolean }) {
    const isServer = opts.target === 'ssr' || !!loadOpts.ssr;
    const manifest = isServer ? opts.manifestInput : null;
    return `// @qwik-client-manifest
export const manifest = ${JSON.stringify(manifest)};\n`;
  }

  return {
    buildStart,
    createOutputAnalyzer,
    getQwikBuildModule,
    getOptimizer,
    getOptions,
    getPath,
    getSys,
    getTransformedOutputs,
    init,
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
  const [pathId, query] = originalId.split('?');
  const queryStr = query || '';
  return {
    originalId,
    pathId,
    query: queryStr ? `?${query}` : '',
    params: new URLSearchParams(queryStr),
  };
}

function forceJSExtension(id: string, ext: string) {
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

const TRANSFORM_REGEX = /\.qwik\.(m|c)?js$/;

export const QWIK_CORE_ID = '@builder.io/qwik';

export const QWIK_BUILD_ID = '@builder.io/qwik/build';

export const QWIK_JSX_RUNTIME_ID = '@builder.io/qwik/jsx-runtime';

export const QWIK_CLIENT_MANIFEST_ID = '@qwik-client-manifest';

export const SRC_DIR_DEFAULT = 'src';

const CLIENT_OUT_DIR = 'dist';

const SSR_OUT_DIR = 'server';

const LIB_OUT_DIR = 'lib';

export const Q_MANIFEST_FILENAME = 'q-manifest.json';

export interface QwikPluginOptions {
  buildMode?: QwikBuildMode;
  debug?: boolean;
  entryStrategy?: EntryStrategy;
  forceFullBuild?: boolean;
  rootDir?: string;
  vendorRoots?: string[];
  manifestOutput?: ((manifest: QwikManifest) => Promise<void> | void) | null;
  manifestInput?: QwikManifest | null;
  input?: string[] | string;
  format?: 'es' | 'cjs';
  outDir?: string;
  srcDir?: string | null;
  scope?: string | null;
  srcInputs?: TransformModuleInput[] | null;
  resolveQwikBuild?: boolean;
  target?: QwikBuildTarget;
  transformedModuleOutput?:
    | ((transformedModules: TransformModule[]) => Promise<void> | void)
    | null;
}

export interface NormalizedQwikPluginOptions extends Required<QwikPluginOptions> {
  input: string[];
}

export type QwikBuildTarget = 'client' | 'ssr' | 'lib';

export type QwikBuildMode = 'production' | 'development';
