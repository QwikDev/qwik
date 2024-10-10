import type { Rollup, Plugin, ViteDevServer, HmrContext } from 'vite';
import { hashCode } from '../../../core/util/hash_code';
import { generateManifestFromBundles, getValidManifest } from '../manifest';
import { createOptimizer } from '../optimizer';
import type {
  Diagnostic,
  EntryStrategy,
  GlobalInjections,
  SegmentAnalysis,
  InsightManifest,
  Optimizer,
  OptimizerOptions,
  OptimizerSystem,
  QwikManifest,
  TransformModule,
  TransformModuleInput,
  TransformModulesOptions,
  TransformOutput,
} from '../types';
import { createLinter, type QwikLinter } from './eslint-plugin';
import type { LoadResult, OutputBundle, ResolveIdResult, TransformResult } from 'rollup';
import { isWin } from './vite-utils';

const REG_CTX_NAME = ['server'];

const SERVER_STRIP_EXPORTS = [
  'onGet',
  'onPost',
  'onPut',
  'onRequest',
  'onDelete',
  'onHead',
  'onOptions',
  'onPatch',
  'onStaticGenerate',
];

const SERVER_STRIP_CTX_NAME = [
  'useServer',
  'route',
  'server',
  'action$',
  'loader$',
  'zod$',
  'validator$',
  'globalAction$',
];
const CLIENT_STRIP_CTX_NAME = [
  'useClient',
  'useBrowser',
  'useVisibleTask',
  'client',
  'browser',
  'event$',
];

/**
 * Use `__EXPERIMENTAL__.x` to check if feature `x` is enabled. It will be replaced with `true` or
 * `false` via an exact string replacement.
 *
 * Add experimental features to this enum definition.
 *
 * @alpha
 */
export enum ExperimentalFeatures {
  /** Enable the usePreventNavigate hook */
  preventNavigate = 'preventNavigate',
  /** Enable the Valibot form validation */
  valibot = 'valibot',
  /** Disable SPA navigation handler in Qwik City */
  noSPA = 'noSPA',
}

export interface QwikPackages {
  id: string;
  path: string;
}

export function createPlugin(optimizerOptions: OptimizerOptions = {}) {
  const id = `${Math.round(Math.random() * 899) + 100}`;

  const clientResults = new Map<string, TransformOutput>();
  const clientTransformedOutputs = new Map<string, [TransformModule, string]>();

  const serverResults = new Map<string, TransformOutput>();
  const serverTransformedOutputs = new Map<string, [TransformModule, string]>();
  const knownQrls = new Map<string, string>();

  let internalOptimizer: Optimizer | null = null;
  let linter: QwikLinter | undefined = undefined;
  let diagnosticsCallback: (
    d: Diagnostic[],
    optimizer: Optimizer,
    srcDir: string
  ) => void = () => {};

  const opts: NormalizedQwikPluginOptions = {
    csr: false,
    target: 'client',
    buildMode: 'development',
    debug: false,
    rootDir: null as any,
    tsconfigFileNames: ['./tsconfig.json'],
    input: null as any,
    outDir: null as any,
    assetsDir: null as any,
    resolveQwikBuild: true,
    entryStrategy: null as any,
    srcDir: null as any,
    srcInputs: null as any,
    sourcemap: !!optimizerOptions.sourcemap,
    manifestInput: null,
    insightsManifest: null,
    manifestOutput: null,
    transformedModuleOutput: null,
    scope: null,
    devTools: {
      imageDevTools: true,
      clickToSource: ['Alt'],
    },
    inlineStylesUpToBytes: null as any,
    lint: true,
    experimental: undefined,
  };

  let lazyNormalizePath: (id: string) => string;
  const init = async () => {
    if (!internalOptimizer) {
      internalOptimizer = await createOptimizer(optimizerOptions);
      lazyNormalizePath = makeNormalizePath(internalOptimizer.sys);
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

  let devServer: ViteDevServer | undefined;
  const configureServer = (server: ViteDevServer) => {
    devServer = server;
  };

  /** Note that as a side-effect this updates the internal plugin `opts` */
  const normalizeOptions = (inputOpts?: QwikPluginOptions) => {
    const updatedOpts: QwikPluginOptions = Object.assign({}, inputOpts);

    const optimizer = getOptimizer();
    const path = optimizer.sys.path;

    opts.debug = !!updatedOpts.debug;

    if (updatedOpts.assetsDir) {
      opts.assetsDir = updatedOpts.assetsDir;
    }

    if (
      updatedOpts.target === 'ssr' ||
      updatedOpts.target === 'client' ||
      updatedOpts.target === 'lib' ||
      updatedOpts.target === 'test'
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
      if (opts.target === 'ssr' || opts.target === 'test') {
        opts.entryStrategy = { type: 'hoist' };
      } else if (opts.target === 'lib') {
        opts.entryStrategy = { type: 'inline' };
      } else {
        if (opts.buildMode === 'production') {
          opts.entryStrategy = { type: 'smart' };
        } else {
          opts.entryStrategy = { type: 'segment' };
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

    if (Array.isArray(updatedOpts.tsconfigFileNames) && updatedOpts.tsconfigFileNames.length > 0) {
      opts.tsconfigFileNames = updatedOpts.tsconfigFileNames;
    }

    if (Array.isArray(opts.srcInputs)) {
      opts.srcInputs.forEach((i) => {
        i.path = normalizePath(path.resolve(opts.rootDir, i.path));
      });
    } else if (typeof opts.srcDir === 'string') {
      opts.srcDir = normalizePath(path.resolve(opts.rootDir, normalizePath(opts.srcDir)));
    }

    if (!updatedOpts.csr) {
      if (Array.isArray(updatedOpts.input)) {
        opts.input = [...updatedOpts.input];
      } else if (typeof updatedOpts.input === 'string') {
        opts.input = [updatedOpts.input];
      } else {
        if (opts.target === 'ssr') {
          // ssr input default
          opts.input = [path.resolve(srcDir, 'entry.ssr')];
        } else if (opts.target === 'client') {
          // client input default
          opts.input = [path.resolve(srcDir, 'root')];
        } else if (opts.target === 'lib') {
          if (typeof updatedOpts.input === 'object') {
            for (const key in updatedOpts.input) {
              const resolvedPaths: { [key: string]: string } = {};
              if (Object.hasOwnProperty.call(updatedOpts.input, key)) {
                const relativePath = updatedOpts.input[key];
                const absolutePath = path.resolve(opts.rootDir, relativePath);
                resolvedPaths[key] = absolutePath;
              }

              opts.input = { ...opts.input, ...resolvedPaths };
            }
          } else {
            // lib input default
            opts.input = [path.resolve(srcDir, 'index.ts')];
          }
        } else {
          opts.input = [];
        }
      }
      opts.input = Array.isArray(opts.input)
        ? opts.input.reduce((inputs, i) => {
            let input = i;
            if (!i.startsWith('@') && !i.startsWith('~') && !i.startsWith('#')) {
              input = normalizePath(path.resolve(opts.rootDir, i));
            }
            if (!inputs.includes(input)) {
              inputs.push(input);
            }
            return inputs;
          }, [] as string[])
        : opts.input;

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

    opts.scope = updatedOpts.scope ?? null;

    if (typeof updatedOpts.resolveQwikBuild === 'boolean') {
      opts.resolveQwikBuild = updatedOpts.resolveQwikBuild;
    }

    if (typeof updatedOpts.devTools === 'object') {
      if ('imageDevTools' in updatedOpts.devTools) {
        opts.devTools.imageDevTools = updatedOpts.devTools.imageDevTools;
      }

      if ('clickToSource' in updatedOpts.devTools) {
        opts.devTools.clickToSource = updatedOpts.devTools.clickToSource;
      }
    }
    opts.csr = !!updatedOpts.csr;

    opts.inlineStylesUpToBytes = optimizerOptions.inlineStylesUpToBytes ?? 20000;
    if (typeof opts.inlineStylesUpToBytes !== 'number' || opts.inlineStylesUpToBytes < 0) {
      opts.inlineStylesUpToBytes = 0;
    }

    if (typeof updatedOpts.lint === 'boolean') {
      opts.lint = updatedOpts.lint;
    } else {
      opts.lint = updatedOpts.buildMode === 'development';
    }

    opts.experimental = undefined;
    for (const feature of updatedOpts.experimental ?? []) {
      if (!ExperimentalFeatures[feature as ExperimentalFeatures]) {
        console.error(`Qwik plugin: Unknown experimental feature: ${feature}`);
      } else {
        (opts.experimental ||= {} as any)[feature] = true;
      }
    }

    return { ...opts };
  };

  let hasValidatedSource = false;

  const validateSource = async (resolver: (id: string) => Promise<unknown | undefined>) => {
    if (!hasValidatedSource) {
      hasValidatedSource = true;

      const sys = getSys();
      if (sys.env === 'node') {
        const fs: typeof import('fs') = await sys.dynamicImport('node:fs');
        if (!fs.existsSync(opts.rootDir)) {
          throw new Error(`Qwik rootDir "${opts.rootDir}" not found.`);
        }
        if (typeof opts.srcDir === 'string' && !fs.existsSync(opts.srcDir)) {
          throw new Error(`Qwik srcDir "${opts.srcDir}" not found.`);
        }
        for (const [_, input] of Object.entries(opts.input || {})) {
          const resolved = await resolver(input);
          if (!resolved) {
            throw new Error(`Qwik input "${input}" not found.`);
          }
        }
      }
    }
  };

  let optimizer: Optimizer;
  const buildStart = async (_ctx: Rollup.PluginContext) => {
    debug(`buildStart()`, opts.buildMode, opts.scope, opts.target, opts.rootDir, opts.srcDir);
    optimizer = getOptimizer();
    if (optimizer.sys.env === 'node' && opts.target === 'ssr' && opts.lint) {
      try {
        linter = await createLinter(optimizer.sys, opts.rootDir, opts.tsconfigFileNames);
      } catch {
        // Nothing
      }
    }

    const path = getPath();

    if (Array.isArray(opts.srcInputs)) {
      optimizer.sys.getInputFiles = async (rootDir) =>
        opts.srcInputs!.map((i) => {
          const relInput: TransformModuleInput = {
            path: normalizePath(path.relative(rootDir, i.path)),
            code: i.code,
          };
          return relInput;
        });
      debug(`buildStart() opts.srcInputs (${opts.srcInputs.length})`);
    }

    debug(`transformedOutputs.clear()`);
    clientTransformedOutputs.clear();
    serverTransformedOutputs.clear();
  };

  const getIsServer = (viteOpts?: { ssr?: boolean }) => {
    return devServer ? !!viteOpts?.ssr : opts.target === 'ssr' || opts.target === 'test';
  };

  const getParentId = (id: string, isServer: boolean) => {
    const transformedOutputs = isServer ? serverTransformedOutputs : clientTransformedOutputs;
    const segment = transformedOutputs.get(id);
    if (segment) {
      return segment[1];
    }
    const hash = getSymbolHash(id);
    return hash && knownQrls.get(hash);
  };

  let resolveIdCount = 0;
  /**
   * This resolves virtual names and QRL segments/entries. All the rest falls through. We must
   * always return a value for QRL segments because they don't exist on disk.
   */
  const resolveId = (
    ctx: Rollup.PluginContext,
    id: string,
    importerId: string | undefined,
    resolveOpts?: Parameters<Extract<Plugin['resolveId'], Function>>[2]
  ) => {
    if (id.startsWith('\0')) {
      return;
    }
    const count = resolveIdCount++;
    const isServer = getIsServer(resolveOpts);
    debug(`resolveId(${count})`, `begin ${id} | ${isServer ? 'server' : 'client'} | ${importerId}`);

    /**
     * During development, the QRL filenames will be of the form `${parentId}_${name}_${hash}.js`,
     * and we might get requests for QRLs from the client before the parent was built.
     *
     * Furthermore, the client requests come in via HTTP and they are encoded in a lossy way.
     *
     * So, first we need to recover the real requested id, then we need to make it an absolute path,
     * and then we can start matching.
     */
    const parsedImporterId = importerId && parseId(importerId);
    importerId = parsedImporterId && normalizePath(parsedImporterId.pathId);
    const path = getPath();
    const importerDir = parsedImporterId && path.dirname(parsedImporterId.pathId);

    /**
     * A request possibly from the browser. It could be our own QRLs requests, which we uri encode,
     * or an import generated by vite. So we have to be careful.
     */
    if (devServer && id.startsWith('/') && importerId?.endsWith('.html')) {
      const maybeQrl = decodeURIComponent(id);
      // We encode absolute paths like this, due to e.g. pnpm linking
      if (maybeQrl.startsWith('/@fs/')) {
        // remove `/@fs/` prefix for Windows
        // remove `/@fs` prefix for Unix
        id = maybeQrl.slice(isWin(optimizer!.sys.os) ? 5 : 4);
      } else {
        /**
         * This path could still be absolute, when encoded by Vite. If the first path segment is the
         * same as that of the importer dir, we assume it's absolute.
         */
        if (!maybeQrl.startsWith(importerDir!.slice(0, importerDir!.indexOf('/', 1)))) {
          id = path.join(importerDir!, maybeQrl);
        }
      }
      // Now we hopefully removed the influence of the http encoding
    }

    // Relative paths must be resolved vs the importer
    if (id.startsWith('.') && importerDir) {
      id = path.resolve(importerDir, id);
    }

    // Split query, remove windows path encoding etc
    const parsedId = parseId(id);
    const pathId = normalizePath(parsedId.pathId);

    let result: ResolveIdResult;

    // During regular builds, we'll encounter parents before QRLs, so this will match
    if (getParentId(pathId, isServer)) {
      debug(`resolveId(${count}) Resolved already known ${pathId}`);
      result = {
        id: pathId + parsedId.query,
        moduleSideEffects: false,
      };
    } else if (
      //  We test with endsWith because the dev server might add a /
      pathId.endsWith(QWIK_BUILD_ID)
    ) {
      /**
       * Now we're in the case where we have a QRL segment that hasn't been transformed yet or one
       * of the virtual modules.
       */
      if (opts.resolveQwikBuild) {
        debug(`resolveId(${count})`, 'Resolved', QWIK_BUILD_ID);
        result = {
          // We use / because \0 gives errors
          id: `/${QWIK_BUILD_ID}`,
          moduleSideEffects: false,
        };
      }
    } else if (pathId.endsWith(QWIK_CLIENT_MANIFEST_ID)) {
      debug(`resolveId(${count})`, 'Resolved', QWIK_CLIENT_MANIFEST_ID);
      result = {
        id: `/${QWIK_CLIENT_MANIFEST_ID}`,
        moduleSideEffects: false,
      };
    } else {
      /**
       * If this looks like a dev qrl filename, it doesn't matter who imports, we have the parentId
       * embedded.
       */
      const match = /^(.*\.[mc]?[jt]sx?)_([^/]+)_([^_]+)\.js($|\?)/.exec(pathId);
      if (match) {
        const [, parentId, name, hash] = match;
        return ctx.resolve(parentId, importerId, { skipSelf: true }).then((resolved) => {
          if (resolved) {
            debug(`resolveId(${count})`, `resolved to QRL ${name}_${hash} of ${parentId}`);
            // Save for quick lookup
            knownQrls.set(hash, resolved.id);
            return {
              id: pathId + parsedId.query,
              // QRL segments can't have side effects. Probably never useful, but it's here for consistency
              moduleSideEffects: false,
            };
          } else {
            debug(`resolveId(${count})`, `${parentId} does not exist`);
          }
        });
      } else if (importerId) {
        /**
         * When we get here it's neither a virtual module nor a QRL segment. However, Rollup can ask
         * us to resolve imports from QRL segments. It seems like importers need to exist on disk
         * for this to work automatically, so for segments we resolve via the parent instead.
         *
         * Note that when a this happens, the segment was already resolved and transformed, so we
         * know about it.
         */
        const importerParentId = getParentId(importerId, isServer);
        if (importerParentId) {
          debug(`resolveId(${count})`, `resolving via ${importerParentId}`);
          // This returns a promise that we can't await because of deadlocking
          return ctx.resolve(id, importerParentId, { skipSelf: true });
        }
      }
    }

    debug(`resolveId(${count}) end`, (result as any)?.id || result);
    return result;
  };

  let loadCount = 0;
  const load = async (
    ctx: Rollup.PluginContext,
    id: string,
    loadOpts?: Parameters<Extract<Plugin['load'], Function>>[1]
  ): Promise<LoadResult> => {
    if (id.startsWith('\0') || id.startsWith('/@fs/')) {
      return;
    }
    const count = loadCount++;
    const isServer = getIsServer(loadOpts);

    // Virtual modules
    if (opts.resolveQwikBuild && id === `/${QWIK_BUILD_ID}`) {
      debug(`load(${count})`, QWIK_BUILD_ID, opts.buildMode);
      return {
        moduleSideEffects: false,
        code: getQwikBuildModule(isServer, opts.target),
      };
    }
    if (id === `/${QWIK_CLIENT_MANIFEST_ID}`) {
      debug(`load(${count})`, QWIK_CLIENT_MANIFEST_ID, opts.buildMode);
      return {
        moduleSideEffects: false,
        code: await getQwikServerManifestModule(isServer),
      };
    }

    // QRL segments
    const parsedId = parseId(id);
    id = normalizePath(parsedId.pathId);
    const outputs = isServer ? serverTransformedOutputs : clientTransformedOutputs;
    if (devServer && !outputs.has(id)) {
      // in dev mode, it could be that the id is a QRL segment that wasn't transformed yet
      const parentId = getParentId(id, isServer);
      if (parentId) {
        // building here via ctx.load doesn't seem to work (no transform), instead we use the devserver directly
        debug(`load(${count})`, 'transforming QRL parent', parentId);
        // We need to encode it as an absolute path
        await devServer.transformRequest(`/@fs${parentId.startsWith('/') ? '' : '/'}${parentId}`);
        // The QRL segment should exist now
        if (!outputs.has(id)) {
          debug(`load(${count})`, `QRL segment ${id} not found in ${parentId}`);
          return null;
        }
      }
    }

    const transformedModule = outputs.get(id);

    if (transformedModule) {
      debug(`load(${count})`, 'Found', id);
      const { code, map, segment } = transformedModule[0];
      return { code, map, meta: { segment } };
    }

    debug(`load(${count})`, 'Not a QRL or virtual module', id);
    return null;
  };

  let transformCount = 0;
  const transform = async function (
    ctx: Rollup.PluginContext,
    code: string,
    id: string,
    transformOpts: Parameters<Extract<Plugin['transform'], Function>>[2] = {}
  ): Promise<TransformResult> {
    if (id.startsWith('\0')) {
      return;
    }
    const count = transformCount++;
    const isServer = getIsServer(transformOpts);
    const currentOutputs = isServer ? serverTransformedOutputs : clientTransformedOutputs;
    if (currentOutputs.has(id)) {
      // This is a QRL segment, and we don't need to process it any further
      return;
    }

    const optimizer = getOptimizer();
    const path = getPath();

    const { pathId } = parseId(id);
    const parsedPathId = path.parse(pathId);
    const dir = parsedPathId.dir;
    const base = parsedPathId.base;
    const ext = parsedPathId.ext.toLowerCase();
    if (ext in TRANSFORM_EXTS || TRANSFORM_REGEX.test(pathId)) {
      /** Strip client|server code from qwik server|client, but not in lib/test */
      const strip = opts.target === 'client' || opts.target === 'ssr';
      const normalizedID = normalizePath(pathId);
      debug(
        `transform(${count})`,
        `Transforming ${id} (for: ${isServer ? 'server' : 'client'}${strip ? ', strip' : ''})`
      );

      const mode =
        opts.target === 'lib' ? 'lib' : opts.buildMode === 'development' ? 'dev' : 'prod';

      if (mode !== 'lib') {
        // this messes a bit with the source map, but it's ok for if statements
        code = code.replaceAll(/__EXPERIMENTAL__\.(\w+)/g, (_, feature) => {
          if (opts.experimental?.[feature as ExperimentalFeatures]) {
            return 'true';
          }
          return 'false';
        });
      }

      let filePath = base;
      if (opts.srcDir) {
        filePath = path.relative(opts.srcDir, pathId);
      }
      filePath = normalizePath(filePath);
      const srcDir = opts.srcDir ? opts.srcDir : normalizePath(dir);
      const entryStrategy: EntryStrategy = opts.entryStrategy;
      const transformOpts: TransformModulesOptions = {
        input: [{ code, path: filePath }],
        entryStrategy: isServer ? { type: 'hoist' } : entryStrategy,
        minify: 'simplify',
        // Always enable sourcemaps in dev for click-to-source
        sourceMaps: opts.sourcemap || 'development' === opts.buildMode,
        transpileTs: true,
        transpileJsx: true,
        explicitExtensions: true,
        preserveFilenames: true,
        srcDir,
        rootDir: opts.rootDir,
        mode,
        scope: opts.scope || undefined,
        isServer,
      };

      if (strip) {
        if (isServer) {
          transformOpts.stripCtxName = CLIENT_STRIP_CTX_NAME;
          transformOpts.stripEventHandlers = true;
          transformOpts.regCtxName = REG_CTX_NAME;
        } else {
          transformOpts.stripCtxName = SERVER_STRIP_CTX_NAME;
          transformOpts.stripExports = SERVER_STRIP_EXPORTS;
        }
      }

      const newOutput = optimizer.transformModulesSync(transformOpts);
      const module = newOutput.modules.find((mod) => !isAdditionalFile(mod))!;

      // uncomment to show transform results
      // debug({ isServer, strip }, transformOpts, newOutput);
      diagnosticsCallback(newOutput.diagnostics, optimizer, srcDir);

      if (isServer) {
        if (newOutput.diagnostics.length === 0 && linter) {
          linter.lint(ctx, code, id);
        }
        serverResults.set(normalizedID, newOutput);
      } else {
        clientResults.set(normalizedID, newOutput);
      }
      const deps = new Set<string>();
      for (const mod of newOutput.modules) {
        if (mod !== module) {
          const key = normalizePath(path.join(srcDir, mod.path));
          debug(`transform(${count})`, `segment ${key}`, mod.segment?.displayName);
          currentOutputs.set(key, [mod, id]);
          deps.add(key);
          if (opts.target === 'client') {
            if (devServer) {
              // invalidate the segment so that the client will pick it up
              const rollupModule = devServer.moduleGraph.getModuleById(key);
              if (rollupModule) {
                devServer.moduleGraph.invalidateModule(rollupModule);
              }
            } else {
              // rollup must be told about all entry points
              ctx.emitFile({
                id: key,
                type: 'chunk',
                preserveSignature: 'allow-extension',
              });
            }
          }
        }
      }

      // Force loading generated submodules into Rollup cache so later
      // unchanged imports are not missing in our internal transform cache
      // This can happen in the repl when the plugin is re-initialized
      // and possibly in other places
      for (const id of deps.values()) {
        await ctx.load({ id });
      }

      ctx.addWatchFile(id);

      return {
        code: module.code,
        map: module.map,
        meta: {
          segment: module.segment,
          qwikdeps: Array.from(deps),
        },
      };
    }

    debug(`transform(${count})`, 'Not transforming', id);

    return null;
  };

  const createOutputAnalyzer = (rollupBundle: OutputBundle) => {
    const injections: GlobalInjections[] = [];

    const addInjection = (b: GlobalInjections) => injections.push(b);
    const generateManifest = async () => {
      const optimizer = getOptimizer();
      const path = optimizer.sys.path;

      const segments = Array.from(clientResults.values())
        .flatMap((r) => r.modules)
        .map((mod) => mod.segment)
        .filter((h) => !!h) as SegmentAnalysis[];

      const manifest = generateManifestFromBundles(
        path,
        segments,
        injections,
        rollupBundle,
        opts,
        debug
      );

      for (const symbol of Object.values(manifest.symbols)) {
        if (symbol.origin) {
          symbol.origin = normalizePath(symbol.origin);
        }
      }

      for (const bundle of Object.values(manifest.bundles)) {
        if (bundle.origins) {
          bundle.origins = bundle.origins
            .map((abs) => {
              const relPath = path.relative(opts.rootDir, abs);
              return normalizePath(relPath);
            })
            .sort();
        }
      }

      manifest.manifestHash = hashCode(JSON.stringify(manifest));

      return manifest;
    };

    return { addInjection, generateManifest };
  };

  const getOptions = () => opts;

  const getTransformedOutputs = () => {
    return Array.from(clientTransformedOutputs.values()).map((t) => {
      return t[0];
    });
  };

  const debug = (...str: any[]) => {
    if (opts.debug) {
      // eslint-disable-next-line no-console
      console.debug(`[QWIK PLUGIN: ${id}]`, ...str);
    }
  };

  const log = (...str: any[]) => {
    // eslint-disable-next-line no-console
    console.log(`[QWIK PLUGIN: ${id}]`, ...str);
  };

  const onDiagnostics = (cb: (d: Diagnostic[], optimizer: Optimizer, srcDir: string) => void) => {
    diagnosticsCallback = cb;
  };

  const normalizePath = (id: string) => lazyNormalizePath(id);

  function getQwikBuildModule(isServer: boolean, _target: QwikBuildTarget) {
    const isDev = opts.buildMode === 'development';
    return `// @builder.io/qwik/build
export const isServer = ${JSON.stringify(isServer)};
export const isBrowser = ${JSON.stringify(!isServer)};
export const isDev = ${JSON.stringify(isDev)};
`;
  }

  async function getQwikServerManifestModule(isServer: boolean) {
    const manifest = isServer ? opts.manifestInput : null;
    return `// @qwik-client-manifest
export const manifest = ${JSON.stringify(manifest)};\n`;
  }

  function setSourceMapSupport(sourcemap: boolean) {
    opts.sourcemap = sourcemap;
  }

  // Only used in Vite dev mode
  function handleHotUpdate(ctx: HmrContext) {
    debug('handleHotUpdate()', ctx.file);

    for (const mod of ctx.modules) {
      const { id } = mod;
      if (id) {
        debug('handleHotUpdate()', `invalidate ${id}`);
        serverResults.delete(id);
        clientResults.delete(id);
        for (const outputs of [clientTransformedOutputs, serverTransformedOutputs]) {
          for (const [key, [_, parentId]] of outputs) {
            if (parentId === id) {
              debug('handleHotUpdate()', `invalidate ${id} segment ${key}`);
              outputs.delete(key);
              const mod = ctx.server.moduleGraph.getModuleById(key);
              if (mod) {
                ctx.server.moduleGraph.invalidateModule(mod);
              }
            }
          }
        }
      }
      for (const dep of mod.info?.meta?.qwikdeps || []) {
        debug('handleHotUpdate()', `invalidate segment ${dep}`);
        serverTransformedOutputs.delete(dep);
        clientTransformedOutputs.delete(dep);
        const mod = ctx.server.moduleGraph.getModuleById(dep);
        if (mod) {
          ctx.server.moduleGraph.invalidateModule(mod);
        }
      }
    }
  }

  // This groups all QRL segments into their respective entry points
  // optimization opportunity: group small segments that don't import anything into smallish chunks
  // order by discovery time, so that related segments are more likely to group together
  function manualChunks(id: string, { getModuleInfo }: Rollup.ManualChunkMeta) {
    const module = getModuleInfo(id)!;
    const segment = module.meta.segment as SegmentAnalysis | undefined;
    return segment?.entry;
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
    debug,
    log,
    normalizeOptions,
    normalizePath,
    onDiagnostics,
    resolveId,
    transform,
    validateSource,
    setSourceMapSupport,
    configureServer,
    handleHotUpdate,
    manualChunks,
  };
}

/** Convert windows backslashes to forward slashes */
export const makeNormalizePath = (sys: OptimizerSystem) => (id: string) => {
  if (typeof id === 'string') {
    if (isWin(sys.os)) {
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

function isAdditionalFile(mod: TransformModule) {
  return mod.isEntry || mod.segment;
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

export const getSymbolHash = (symbolName: string) =>
  /_([a-z0-9]+)($|\.js($|\?))/.exec(symbolName)?.[1];

const TRANSFORM_EXTS = {
  '.jsx': true,
  '.ts': true,
  '.tsx': true,
} as const;

const RESOLVE_EXTS = {
  '.tsx': true,
  '.ts': true,
  '.jsx': true,
  '.js': true,
  '.mjs': true,
  '.cjs': true,
} as const;

/**
 * Any file that matches this needs to be processed by Qwik to extract QRL segments etc. Used in
 * libraries.
 *
 * @internal
 */
export const TRANSFORM_REGEX = /\.qwik\.[mc]?js$/;

export const QWIK_CORE_ID = '@builder.io/qwik';

export const QWIK_BUILD_ID = '@builder.io/qwik/build';

export const QWIK_JSX_RUNTIME_ID = '@builder.io/qwik/jsx-runtime';

export const QWIK_JSX_DEV_RUNTIME_ID = '@builder.io/qwik/jsx-dev-runtime';

export const QWIK_CORE_SERVER = '@builder.io/qwik/server';

export const QWIK_CLIENT_MANIFEST_ID = '@qwik-client-manifest';

export const SRC_DIR_DEFAULT = 'src';

export const CLIENT_OUT_DIR = 'dist';

export const SSR_OUT_DIR = 'server';

const LIB_OUT_DIR = 'lib';

export const Q_MANIFEST_FILENAME = 'q-manifest.json';

export interface QwikPluginDevTools {
  imageDevTools?: boolean | true;
  clickToSource?: string[] | false;
}

export interface QwikPluginOptions {
  csr?: boolean;
  buildMode?: QwikBuildMode;
  debug?: boolean;
  entryStrategy?: EntryStrategy;
  rootDir?: string;
  tsconfigFileNames?: string[];
  /** @deprecated No longer used */
  vendorRoots?: string[];
  manifestOutput?: ((manifest: QwikManifest) => Promise<void> | void) | null;
  manifestInput?: QwikManifest | null;
  insightsManifest?: InsightManifest | null;
  input?: string[] | string | { [entry: string]: string };
  outDir?: string;
  assetsDir?: string;
  srcDir?: string | null;
  scope?: string | null;
  srcInputs?: TransformModuleInput[] | null;
  sourcemap?: boolean;
  resolveQwikBuild?: boolean;
  target?: QwikBuildTarget;
  transformedModuleOutput?:
    | ((transformedModules: TransformModule[]) => Promise<void> | void)
    | null;
  devTools?: QwikPluginDevTools;
  /**
   * Inline styles up to a certain size (in bytes) instead of using a separate file.
   *
   * Default: 20kb (20,000bytes)
   */
  inlineStylesUpToBytes?: number;
  /**
   * Run eslint on the source files for the ssr build or dev server. This can slow down startup on
   * large projects. Defaults to `true`
   */
  lint?: boolean;
  /**
   * Experimental features. These can come and go in patch releases, and their API is not guaranteed
   * to be stable between releases.
   */
  experimental?: (keyof typeof ExperimentalFeatures)[];
}

export interface NormalizedQwikPluginOptions
  extends Omit<Required<QwikPluginOptions>, 'vendorRoots' | 'experimental'> {
  input: string[] | { [entry: string]: string };
  experimental?: Record<keyof typeof ExperimentalFeatures, boolean>;
}

/** @public */
export type QwikBuildTarget = 'client' | 'ssr' | 'lib' | 'test';

/** @public */
export type QwikBuildMode = 'production' | 'development';
