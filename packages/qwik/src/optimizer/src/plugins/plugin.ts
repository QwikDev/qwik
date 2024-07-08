import type { Rollup, Plugin, ViteDevServer } from 'vite';
import { hashCode } from '../../../core/util/hash_code';
import { generateManifestFromBundles, getValidManifest } from '../manifest';
import { createOptimizer } from '../optimizer';
import type {
  Diagnostic,
  EntryStrategy,
  GlobalInjections,
  HookAnalysis,
  InsightManifest,
  Optimizer,
  OptimizerOptions,
  QwikManifest,
  TransformFsOptions,
  TransformModule,
  TransformModuleInput,
  TransformModulesOptions,
  TransformOutput,
} from '../types';
import { createLinter, type QwikLinter } from './eslint-plugin';
import type { LoadResult, OutputBundle, TransformResult } from 'rollup';

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
  const foundQrls = new Map<string, string>();

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
    vendorRoots: [],
    scope: null,
    devTools: {
      imageDevTools: true,
      clickToSource: ['Alt'],
    },
    inlineStylesUpToBytes: null as any,
    lint: true,
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

  let server: ViteDevServer | undefined;
  const configureServer = (devServer: ViteDevServer) => {
    server = devServer;
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

    updatedOpts.target === 'test';
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

    opts.vendorRoots = updatedOpts.vendorRoots ? updatedOpts.vendorRoots : [];
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

  const buildStart = async (ctx: Rollup.PluginContext) => {
    debug(`buildStart()`, opts.buildMode, opts.scope, opts.target);
    const optimizer = getOptimizer();
    if (optimizer.sys.env === 'node' && opts.target === 'ssr' && opts.lint) {
      try {
        linter = await createLinter(optimizer.sys, opts.rootDir, opts.tsconfigFileNames);
      } catch (err) {
        // Nothing
      }
    }

    // Problematic part of the plugin: parse the entire source tree in the hopes of
    // having all code combined into the entry hooks. This is a problem because it
    // prevents other plugins from having a look at the untouched code.
    // TODO work out a way to combine entries in a more incremental way
    // Note: During dev mode, entry strategy is hook, so this doesn't run
    const generatePreManifest = !['hoist', 'hook', 'inline'].includes(opts.entryStrategy.type);
    if (generatePreManifest) {
      const path = getPath();

      let srcDir = '/';
      if (typeof opts.srcDir === 'string') {
        srcDir = normalizePath(opts.srcDir);
        debug(`buildStart() srcDir`, opts.srcDir);
      } else if (Array.isArray(opts.srcInputs)) {
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
      const vendorRoots = opts.vendorRoots;
      if (vendorRoots.length > 0) {
        debug(`vendorRoots`, vendorRoots);
      }

      debug(`transformedOutput.clear()`);
      clientTransformedOutputs.clear();

      const mode =
        opts.target === 'lib' ? 'lib' : opts.buildMode === 'development' ? 'dev' : 'prod';
      const transformOpts: TransformFsOptions = {
        srcDir,
        rootDir: opts.rootDir,
        vendorRoots,
        entryStrategy: opts.entryStrategy,
        minify: 'simplify',
        transpileTs: true,
        transpileJsx: true,
        explicitExtensions: true,
        preserveFilenames: true,
        mode,
        scope: opts.scope ? opts.scope : undefined,
        sourceMaps: opts.sourcemap,
      };

      if (opts.target === 'client') {
        transformOpts.stripCtxName = SERVER_STRIP_CTX_NAME;
        transformOpts.stripExports = SERVER_STRIP_EXPORTS;
        transformOpts.isServer = false;
      } else if (opts.target === 'ssr') {
        transformOpts.stripCtxName = CLIENT_STRIP_CTX_NAME;
        transformOpts.stripEventHandlers = true;
        transformOpts.isServer = true;
        transformOpts.regCtxName = REG_CTX_NAME;
      }

      const result = await optimizer.transformFs(transformOpts);
      for (const output of result.modules) {
        const key = normalizePath(path.join(srcDir, output.path)!);
        debug(`buildStart() add transformedOutput`, key, output.hook?.displayName);
        clientTransformedOutputs.set(key, [output, key]);
        serverTransformedOutputs.set(key, [output, key]);
        if (opts.target === 'client' && output.isEntry) {
          ctx.emitFile({
            id: key,
            type: 'chunk',
            preserveSignature: 'allow-extension',
          });
        }
      }

      diagnosticsCallback(result.diagnostics, optimizer, srcDir);

      clientResults.set('@buildStart', result);
      serverResults.set('@buildStart', result);
    }
  };

  const resolveId = async (
    ctx: Rollup.PluginContext,
    id: string,
    importerId: string | undefined,
    resolveOpts?: Parameters<Extract<Plugin['resolveId'], Function>>[2]
  ) => {
    debug(`resolveId()`, 'Start', id, importerId, resolveOpts, opts.target);
    if (id.startsWith('\0') || id.startsWith('/@fs')) {
      return;
    }

    if (opts.target === 'lib' && id.startsWith(QWIK_CORE_ID)) {
      return {
        external: true,
        id,
      };
    }

    if (opts.resolveQwikBuild && id.endsWith(QWIK_BUILD_ID)) {
      debug(`resolveId()`, 'Resolved', QWIK_BUILD_ID);
      return {
        id: normalizePath(getPath().resolve(opts.rootDir, QWIK_BUILD_ID)),
        moduleSideEffects: false,
      };
    }

    if (id.endsWith(QWIK_CLIENT_MANIFEST_ID)) {
      debug(`resolveId()`, 'Resolved', QWIK_CLIENT_MANIFEST_ID);
      if (opts.target === 'lib') {
        return {
          id: id,
          external: true,
          moduleSideEffects: false,
        };
      }

      const firstInput = Object.values(opts.input)[0];
      return {
        id: normalizePath(getPath().resolve(firstInput, QWIK_CLIENT_MANIFEST_ID)),
        moduleSideEffects: false,
      };
    }

    const path = getPath();
    const isSSR = !!resolveOpts?.ssr;
    const transformedOutputs = isSSR ? serverTransformedOutputs : clientTransformedOutputs;

    // Requests originating from another file, or the browser
    if (importerId) {
      const looksLikePath = id.startsWith('.') || id.startsWith('/');
      if (!looksLikePath) {
        // Rollup can ask us to resolve imports from QRL segments
        // It seems like files need to exist on disk for this to work automatically,
        // so for segments we provide the parent instead
        const segment = transformedOutputs.get(importerId);
        if (segment) {
          const parentId = segment[1];
          return ctx.resolve(id, parentId, { skipSelf: true });
        }
        return;
      }
      importerId = normalizePath(importerId);
      const parsedImporterId = parseId(importerId);
      const dir = path.dirname(parsedImporterId.pathId);
      if (opts.target === 'ssr' && !isSSR && importerId.endsWith('.html') && server) {
        // This is a request from a dev-mode browser
        // we uri-encode chunk paths in dev mode, and other imported files don't have % in their paths (hopefully)
        // These will be individual source files and their QRL segments
        id = decodeURIComponent(id);
        // Support absolute paths for qrl segments, due to e.g. pnpm linking
        const isAbsoluteFile = id.startsWith('/@fs/');
        if (isAbsoluteFile) {
          id = id.slice(4);
        }
        // Check for parent passed via QRL
        const match = /^([^?]*)\?_qrl_parent=(.*)/.exec(id);
        if (match) {
          id = match[1];
          const parentId = id.slice(0, id.lastIndexOf('/') + 1) + match[2];
          if (!isAbsoluteFile) {
            // We know for sure that the path is relative to the html importer even though it starts with /
            id = normalizePath(path.join(dir, id));
          }
          // building here via ctx.load doesn't seem to work (target is always ssr?)
          // instead we use the devserver directly
          if (!clientResults.has(parentId)) {
            debug(`resolveId()`, 'transforming QRL parent', parentId);
            await server.transformRequest(parentId);
            // The QRL segment should exist now
          }
        }
      }
      const parsedId = parseId(id);
      let importeePathId = normalizePath(parsedId.pathId);
      const ext = path.extname(importeePathId).toLowerCase();
      if (ext in RESOLVE_EXTS) {
        debug(`resolveId("${importeePathId}", "${importerId}")`);
        // resolve relative paths
        importeePathId = normalizePath(path.resolve(dir, importeePathId));

        if (transformedOutputs.has(importeePathId)) {
          debug(`resolveId() Resolved ${importeePathId} from transformedOutputs`);
          return {
            id: importeePathId + parsedId.query,
          };
        }
      }
    } else if (path.isAbsolute(id)) {
      const parsedId = parseId(id);
      const importeePathId = normalizePath(parsedId.pathId);
      const ext = path.extname(importeePathId).toLowerCase();
      if (ext in RESOLVE_EXTS) {
        debug(`resolveId("${importeePathId}", "${importerId}")`);

        if (transformedOutputs.has(importeePathId)) {
          debug(`resolveId() Resolved ${importeePathId} from transformedOutputs`);
          return {
            id: importeePathId + parsedId.query,
          };
        }
      }
    }
    // We don't (yet) know this id
    debug(`resolveId()`, 'Not resolved', id, importerId, resolveOpts);
    return null;
  };

  const load = async (
    ctx: Rollup.PluginContext,
    id: string,
    loadOpts?: Parameters<Extract<Plugin['load'], Function>>[1]
  ): Promise<LoadResult> => {
    if (id.startsWith('\0') || id.startsWith('/@fs/')) {
      return;
    }
    const isSSR = !!loadOpts?.ssr;
    if (opts.resolveQwikBuild && id.endsWith(QWIK_BUILD_ID)) {
      debug(`load()`, QWIK_BUILD_ID, opts.buildMode);
      return {
        moduleSideEffects: false,
        code: getQwikBuildModule(isSSR, opts.target),
      };
    }

    if (id.endsWith(QWIK_CLIENT_MANIFEST_ID)) {
      debug(`load()`, QWIK_CLIENT_MANIFEST_ID, opts.buildMode);
      return {
        moduleSideEffects: false,
        code: await getQwikServerManifestModule(isSSR),
      };
    }
    const parsedId = parseId(id);
    const path = getPath();
    id = normalizePath(parsedId.pathId);

    const transformedModule = isSSR
      ? serverTransformedOutputs.get(id)
      : clientTransformedOutputs.get(id);

    if (transformedModule) {
      debug(`load()`, 'Found', id);
      let { code } = transformedModule[0];
      const { map, hook } = transformedModule[0];

      if (opts.target === 'ssr') {
        const firstInput = Object.values(opts.input)[0];
        // doing this because vite will not use resolveId() when "noExternal" is false
        // so we need to turn the @qwik-client-manifest import into a relative import
        code = code.replace(
          /@qwik-client-manifest/g,
          normalizePath(path.resolve(firstInput, QWIK_CLIENT_MANIFEST_ID))
        );
      }
      return { code, map, meta: { hook } };
    }

    debug('load()', 'Not found', id, parsedId);
    return null;
  };

  const transform = async function (
    ctx: Rollup.PluginContext,
    code: string,
    id: string,
    transformOpts: Parameters<Extract<Plugin['transform'], Function>>[2] = {}
  ): Promise<TransformResult> {
    if (id.startsWith('\0')) {
      return;
    }
    const isSSR = !!transformOpts.ssr;
    // TODO does this clear in dev mode ???
    const currentOutputs = isSSR ? serverTransformedOutputs : clientTransformedOutputs;
    if (currentOutputs.has(id)) {
      return;
    }
    const optimizer = getOptimizer();
    const path = getPath();

    const { pathId } = parseId(id);
    const parsedPathId = path.parse(pathId);
    const dir = parsedPathId.dir;
    const base = parsedPathId.base;
    const ext = parsedPathId.ext.toLowerCase();
    if (
      ext in TRANSFORM_EXTS ||
      TRANSFORM_REGEX.test(pathId) ||
      insideRoots(ext, dir, opts.srcDir, opts.vendorRoots)
    ) {
      /** Strip client|server code from server|client */
      const strip = opts.target === 'client' || opts.target === 'ssr';
      const normalizedID = normalizePath(pathId);
      debug(`transform()`, 'Transforming', {
        pathId,
        id,
        parsedPathId,
        strip,
        isSSR,
        target: opts.target,
      });

      let filePath = base;
      if (opts.srcDir) {
        filePath = path.relative(opts.srcDir, pathId);
      }
      filePath = normalizePath(filePath);
      const srcDir = opts.srcDir ? opts.srcDir : normalizePath(dir);
      const mode =
        opts.target === 'lib' ? 'lib' : opts.buildMode === 'development' ? 'dev' : 'prod';
      const entryStrategy: EntryStrategy = opts.entryStrategy;
      const transformOpts: TransformModulesOptions = {
        input: [{ code, path: filePath }],
        entryStrategy,
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
      };

      if (isSSR) {
        transformOpts.isServer = true;
        transformOpts.entryStrategy = { type: 'hoist' };
      }
      if (strip) {
        if (isSSR) {
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
      if (opts.target === 'ssr') {
        // we're in dev mode. All QRLs that might be emitted in SSR HTML are defined here.
        // register them so that they can be resolved by the dev server
        const matches = module.code.matchAll(/_([a-zA-Z0-9]{11,11})['"][,)]/g);
        for (const [, symbol] of matches) {
          foundQrls.set(symbol, id);
        }
      }

      // uncomment to show transform results
      // debug({ isSSR, strip }, transformOpts, newOutput);
      diagnosticsCallback(newOutput.diagnostics, optimizer, srcDir);

      if (isSSR) {
        if (newOutput.diagnostics.length === 0 && linter) {
          await linter.lint(ctx, code, id);
        }
        serverResults.set(normalizedID, newOutput);
      } else {
        clientResults.set(normalizedID, newOutput);
      }
      const deps = new Set<string>();
      for (const mod of newOutput.modules) {
        if (mod !== module) {
          const key = normalizePath(path.join(srcDir, mod.path));
          currentOutputs.set(key, [mod, id]);
          deps.add(key);
          // rollup must be told about entry points
          if (opts.target === 'client' && mod.isEntry) {
            ctx.emitFile({
              id: key,
              type: 'chunk',
              preserveSignature: 'allow-extension',
            });
          }
          ctx.addWatchFile(key);
        }
      }

      // Force loading generated submodules into Rollup cache so later
      // unchanged imports are not missing in our internal transform cache
      // This can happen in the repl when the plugin is re-initialized
      // and possibly in other places
      for (const id of deps.values()) {
        await ctx.load({ id });
      }

      return {
        code: module.code,
        map: module.map,
        meta: {
          hook: module.hook,
          qwikdeps: Array.from(deps),
        },
      };
    }

    debug(`transform()`, 'Not transforming', id);

    return null;
  };

  const createOutputAnalyzer = (rollupBundle: OutputBundle) => {
    const injections: GlobalInjections[] = [];

    const addInjection = (b: GlobalInjections) => injections.push(b);
    const generateManifest = async () => {
      const optimizer = getOptimizer();
      const path = optimizer.sys.path;

      const hooks = Array.from(clientResults.values())
        .flatMap((r) => r.modules)
        .map((mod) => mod.hook)
        .filter((h) => !!h) as HookAnalysis[];

      const manifest = generateManifestFromBundles(path, hooks, injections, rollupBundle, opts);

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

  function getQwikBuildModule(isSSR: boolean, target: QwikBuildTarget) {
    const isServer = isSSR || target === 'test';
    const isDev = opts.buildMode === 'development';
    return `// @builder.io/qwik/build
export const isServer = ${JSON.stringify(isServer)};
export const isBrowser = ${JSON.stringify(!isServer)};
export const isDev = ${JSON.stringify(isDev)};
`;
  }

  async function getQwikServerManifestModule(isSSR: boolean) {
    const manifest = isSSR ? opts.manifestInput : null;
    return `// @qwik-client-manifest
export const manifest = ${JSON.stringify(manifest)};\n`;
  }

  function setSourceMapSupport(sourcemap: boolean) {
    opts.sourcemap = sourcemap;
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
    foundQrls,
    configureServer,
  };
}

const insideRoots = (ext: string, dir: string, srcDir: string | null, vendorRoots: string[]) => {
  if (ext !== '.js') {
    return false;
  }
  if (srcDir != null && dir.startsWith(srcDir)) {
    return true;
  }
  for (const root of vendorRoots) {
    if (dir.startsWith(root)) {
      return true;
    }
  }
  return false;
};

function isAdditionalFile(mod: TransformModule) {
  return mod.isEntry || mod.hook;
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

const TRANSFORM_REGEX = /\.qwik\.[mc]?js$/;

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
}

export interface NormalizedQwikPluginOptions extends Required<QwikPluginOptions> {
  input: string[] | { [entry: string]: string };
}

/** @public */
export type QwikBuildTarget = 'client' | 'ssr' | 'lib' | 'test';

/** @public */
export type QwikBuildMode = 'production' | 'development';
