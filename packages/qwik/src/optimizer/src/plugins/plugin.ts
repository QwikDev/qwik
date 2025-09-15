import type { HmrContext, Plugin, Rollup, ViteDevServer } from 'vite';
import type { BundleGraphAdder } from '..';
import { hashCode } from '../../../core/shared/utils/hash_code';
import { generateManifestFromBundles, getValidManifest } from '../manifest';
import { createOptimizer } from '../optimizer';
import type {
  Diagnostic,
  EntryStrategy,
  GlobalInjections,
  Optimizer,
  OptimizerOptions,
  OptimizerSystem,
  QwikManifest,
  SegmentAnalysis,
  ServerQwikManifest,
  SmartEntryStrategy,
  TransformModule,
  TransformModuleInput,
  TransformModulesOptions,
  TransformOutput,
} from '../types';
import { convertManifestToBundleGraph } from './bundle-graph';
import { createLinter, type QwikLinter } from './eslint-plugin';
import { isWin, parseId } from './vite-utils';

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
 * @public
 */
export enum ExperimentalFeatures {
  /** Enable the usePreventNavigate hook */
  preventNavigate = 'preventNavigate',
  /** Enable the Valibot form validation */
  valibot = 'valibot',
  /** Disable SPA navigation handler in Qwik Router */
  noSPA = 'noSPA',
  /** Enable request.rewrite() */
  enableRequestRewrite = 'enableRequestRewrite',
  /** Enable worker$ */
  webWorker = 'webWorker',
  /** Enable the ability to use the Qwik Insights vite plugin and `<Insights/>` component */
  insights = 'insights',
}

export interface QwikPackages {
  id: string;
  path: string;
}

export function createQwikPlugin(optimizerOptions: OptimizerOptions = {}) {
  const id = `${Math.round(Math.random() * 899) + 100}`;

  const clientResults = new Map<string, TransformOutput>();
  const clientTransformedOutputs = new Map<string, [TransformModule, string]>();

  const serverTransformedOutputs = new Map<string, [TransformModule, string]>();
  const parentIds = new Map<string, string>();

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
    rootDir: undefined as any,
    tsconfigFileNames: ['./tsconfig.json'],
    input: undefined as any,
    outDir: undefined as any,
    assetsDir: undefined as any,
    resolveQwikBuild: true,
    entryStrategy: undefined as any,
    srcDir: undefined as any,
    ssrOutDir: undefined as any,
    clientOutDir: undefined as any,
    sourcemap: !!optimizerOptions.sourcemap,
    manifestInput: null,
    manifestOutput: null,
    transformedModuleOutput: null,
    scope: null,
    devTools: {
      imageDevTools: true,
      clickToSource: ['Alt'],
    },
    inlineStylesUpToBytes: 20000,
    lint: false,
    experimental: undefined,
  };

  let lazyNormalizePath: (id: string) => string;
  let maybeFs: typeof import('fs') | undefined | null;
  const init = async () => {
    if (!internalOptimizer) {
      internalOptimizer = await createOptimizer(optimizerOptions);
      lazyNormalizePath = makeNormalizePath(internalOptimizer.sys);
      try {
        // only try once, don't spam the console
        if (maybeFs === undefined) {
          maybeFs = await internalOptimizer.sys.dynamicImport('node:fs');
        }
      } catch {
        // eslint-disable-next-line no-console
        console.log('node:fs not available, disabling automatic manifest reading');
        maybeFs = null;
      }
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
  const normalizeOptions = async (
    inputOpts?: QwikPluginOptions
  ): Promise<NormalizedQwikPluginOptions> => {
    const updatedOpts: QwikPluginOptions = Object.assign({}, inputOpts);

    const optimizer = getOptimizer();
    const path = optimizer.sys.path;
    const resolvePath = (...paths: string[]) => normalizePath(path.resolve(...paths));

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
      opts.target ||= 'client';
    }

    if (opts.target === 'lib') {
      opts.buildMode = 'development';
    } else if (updatedOpts.buildMode === 'production' || updatedOpts.buildMode === 'development') {
      opts.buildMode = updatedOpts.buildMode;
    } else {
      opts.buildMode ||= 'development';
    }

    opts.csr = !!updatedOpts.csr;

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
      opts.rootDir ||= optimizer.sys.cwd();
    }
    opts.rootDir = resolvePath(optimizer.sys.cwd(), opts.rootDir);
    let srcDir = resolvePath(opts.rootDir, SRC_DIR_DEFAULT);
    if (typeof updatedOpts.srcDir === 'string') {
      opts.srcDir = resolvePath(opts.rootDir, updatedOpts.srcDir);
      srcDir = opts.srcDir;
    } else {
      opts.srcDir ||= srcDir;
    }
    opts.srcDir = resolvePath(opts.rootDir, opts.srcDir);

    if (Array.isArray(updatedOpts.tsconfigFileNames) && updatedOpts.tsconfigFileNames.length > 0) {
      opts.tsconfigFileNames = updatedOpts.tsconfigFileNames;
    }

    if (!opts.csr && !updatedOpts.input && !opts.input) {
      // we only provide inputs if none were provided by the user
      if (opts.target === 'ssr') {
        // this is for dev mode, prod will have own setting
        opts.input = [resolvePath(srcDir, 'entry.ssr')];
      } else if (opts.target === 'client') {
        // not really an entry, just a starting point
        opts.input = [resolvePath(srcDir, 'root')];
      } else {
        // others including lib should be ok already
        opts.input = undefined!;
      }
    }

    if (updatedOpts.outDir) {
      // forced output directory
      opts.outDir = resolvePath(opts.rootDir, updatedOpts.outDir);
    }

    // default output directory
    opts.clientOutDir = resolvePath(opts.rootDir, updatedOpts.clientOutDir || CLIENT_OUT_DIR);
    opts.ssrOutDir = resolvePath(opts.rootDir, updatedOpts.ssrOutDir || SSR_OUT_DIR);
    if (opts.target === 'ssr') {
      // server
      opts.outDir ||= opts.ssrOutDir;
    } else if (opts.target === 'lib') {
      // library
      opts.outDir ||= resolvePath(opts.rootDir, LIB_OUT_DIR);
    } else {
      // client
      opts.outDir ||= opts.clientOutDir;
    }

    if (typeof updatedOpts.manifestOutput === 'function') {
      opts.manifestOutput = updatedOpts.manifestOutput;
    }

    if (updatedOpts.manifestInput) {
      opts.manifestInput = getValidManifest(updatedOpts.manifestInput) || null;
    }

    if (typeof updatedOpts.transformedModuleOutput === 'function') {
      opts.transformedModuleOutput = updatedOpts.transformedModuleOutput;
    }

    if (updatedOpts.scope !== undefined) {
      opts.scope = updatedOpts.scope;
    } else if (!opts.scope && maybeFs) {
      // Use the package name for the scope
      let pkgPath = '';
      try {
        let pkgDir = opts.rootDir;
        while (true) {
          pkgPath = path.resolve(pkgDir, 'package.json');
          if (await maybeFs.promises.stat(pkgPath).catch(() => false)) {
            break;
          }
          const parent = path.resolve(pkgDir, '..');
          if (parent === pkgDir) {
            break;
          }
          pkgDir = parent;
          pkgPath = '';
        }

        if (pkgPath) {
          const pkgString = await maybeFs.promises.readFile(pkgPath, 'utf-8');
          const pkg = JSON.parse(pkgString);
          if (typeof pkg.name === 'string') {
            opts.scope = pkg.name;
          }
        }
      } catch (e) {
        console.warn(
          `could not read ${pkgPath || 'package.json'} to determine package name, ignoring. (${e})`
        );
      }
    }

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

    if ('inlineStylesUpToBytes' in optimizerOptions) {
      if (typeof optimizerOptions.inlineStylesUpToBytes === 'number') {
        opts.inlineStylesUpToBytes = optimizerOptions.inlineStylesUpToBytes;
      } else if (typeof opts.inlineStylesUpToBytes !== 'number' || opts.inlineStylesUpToBytes < 0) {
        opts.inlineStylesUpToBytes = 0;
      }
    }

    if (typeof updatedOpts.lint === 'boolean') {
      opts.lint = updatedOpts.lint;
    }

    if ('experimental' in updatedOpts) {
      opts.experimental = undefined;
      for (const feature of updatedOpts.experimental ?? []) {
        if (!ExperimentalFeatures[feature as ExperimentalFeatures]) {
          console.error(`Qwik plugin: Unknown experimental feature: ${feature}`);
        } else {
          (opts.experimental ||= {} as any)[feature] = true;
        }
      }
    }

    const out = { ...opts };
    // Make sure to know what the actual input is
    opts.input ||= updatedOpts.input as string[];
    if (opts.input && typeof opts.input === 'string') {
      opts.input = [opts.input];
    }
    return out;
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
  let shouldAddHandlers = false;
  const buildStart = async (_ctx: Rollup.PluginContext) => {
    debug(`buildStart()`, opts.buildMode, opts.scope, opts.target, opts.rootDir, opts.srcDir);
    optimizer = getOptimizer();
    shouldAddHandlers = !devServer;
    if (optimizer.sys.env === 'node' && opts.target === 'ssr' && opts.lint) {
      try {
        linter = await createLinter(optimizer.sys, opts.rootDir, opts.tsconfigFileNames);
      } catch {
        // Nothing
      }
    }

    debug(`transformedOutputs.clear()`);
    clientTransformedOutputs.clear();
    serverTransformedOutputs.clear();

    if (opts.target === 'client') {
      const ql = await _ctx.resolve('@qwik.dev/core/qwikloader.js', undefined, {
        skipSelf: true,
      });
      if (ql) {
        _ctx.emitFile({
          id: ql.id,
          type: 'chunk',
          preserveSignature: 'allow-extension',
        });
      }
    }
  };

  const getIsServer = (viteOpts?: { ssr?: boolean }) => {
    return devServer ? !!viteOpts?.ssr : opts.target === 'ssr' || opts.target === 'test';
  };

  let resolveIdCount = 0;
  let doNotEdit = false;
  /**
   * This resolves virtual names and QRL segments/entries. All the rest falls through. We must
   * always return a value for QRL segments because they don't exist on disk.
   *
   * Note: During development, the QRL filenames will be of the form
   * `${parentUrl}_${name}_${hash}.js`, and we might get requests for QRLs from the client before
   * the parent was built. That means we need to recover the parent from the URL and then in the
   * `load()` phase ensure it is built first.
   */
  const resolveId = async (
    ctx: Rollup.PluginContext,
    id: string,
    importerId: string | undefined,
    resolveOpts?: Parameters<Extract<Plugin['resolveId'], Function>>[2]
  ) => {
    if (id.startsWith('\0')) {
      return;
    }

    // Intercept requests to open in editor
    const editMatch = devServer && /^(.*)\?editor(:(\d+)(:\d+)?)?$/.exec(id);
    if (editMatch) {
      // Throttle so we don't open multiple times on re-resolve
      if (!doNotEdit) {
        doNotEdit = true;
        setTimeout(() => (doNotEdit = false), 500);

        const [, origId, location] = editMatch;
        // Find the actual file on disk by asking vite to resolve it
        const resolved = await ctx.resolve(origId, importerId);
        if (resolved) {
          const file = devServer!.moduleGraph.getModuleById(resolved.id)?.file;
          if (file) {
            const path = `${file}${location}`;
            try {
              console.warn(`Opening in editor: ${path}`);
              const launchEditor = (await import('launch-editor')).default;
              launchEditor(path);
            } catch (e: any) {
              console.error(`Failed to open editor: ${e.message}`);
            }
          }
        }
      }
      return { id: `\0editor` };
    }

    const count = resolveIdCount++;
    const isServer = getIsServer(resolveOpts);
    debug(`resolveId(${count})`, `begin ${id} | ${isServer ? 'server' : 'client'} | ${importerId}`);

    const parsedImporterId = importerId && parseId(importerId);
    importerId = parsedImporterId && normalizePath(parsedImporterId.pathId);

    // Relative paths must be resolved vs the importer
    if (id.startsWith('.') && parsedImporterId) {
      const path = getPath();
      const importerDir = path.dirname(parsedImporterId.pathId);
      if (importerDir) {
        id = path.resolve(importerDir, id);
      }
    }

    // Split query, remove windows path encoding etc
    const parsedId = parseId(id);
    const pathId = normalizePath(parsedId.pathId);

    let result: Rollup.ResolveIdResult;

    /** At this point, the request has been normalized. */

    if (
      /**
       * Check if we know the QRL. During regular builds, we'll encounter and build parents before
       * their QRLs, so this will always match.
       */
      parentIds.get(pathId)
    ) {
      debug(`resolveId(${count}) Resolved already known ${pathId}`);
      result = {
        id: pathId + parsedId.query,
        moduleSideEffects: false,
      };
    } else if (
      /**
       * Now the requests we handle are for one of the virtual modules, or a QRL segment that hasn't
       * been transformed yet.
       */

      // We test with endsWith because the dev server adds the base pathname
      pathId.endsWith(QWIK_BUILD_ID)
    ) {
      if (opts.resolveQwikBuild) {
        debug(`resolveId(${count})`, 'Resolved', QWIK_BUILD_ID);
        result = {
          id: QWIK_BUILD_ID,
          moduleSideEffects: false,
        };
      }
    } else if (pathId.endsWith(QWIK_CLIENT_MANIFEST_ID)) {
      debug(`resolveId(${count})`, 'Resolved', QWIK_CLIENT_MANIFEST_ID);
      result = {
        id: QWIK_CLIENT_MANIFEST_ID,
        moduleSideEffects: false,
      };
    } else if (!devServer && !isServer && pathId.endsWith(QWIK_PRELOADER_ID)) {
      debug(`resolveId(${count})`, 'Resolved', QWIK_PRELOADER_ID);
      const preloader = await ctx.resolve(QWIK_PRELOADER_ID, importerId, {
        skipSelf: true,
      });
      if (preloader) {
        ctx.emitFile({
          id: preloader.id,
          type: 'chunk',
          preserveSignature: 'allow-extension',
        });
        return preloader;
      }
    } else if (pathId.endsWith(QWIK_HANDLERS_ID)) {
      debug(`resolveId(${count})`, 'Resolved', QWIK_HANDLERS_ID);
      result = {
        id: QWIK_HANDLERS_ID,
        moduleSideEffects: false,
      };
    } else {
      // If qwik core is loaded, also add the handlers
      if (!isServer && shouldAddHandlers && id.endsWith('@qwik.dev/core')) {
        shouldAddHandlers = false;
        const key = await ctx.resolve('@qwik.dev/core/handlers.mjs', importerId, {
          skipSelf: true,
        });
        if (!key) {
          throw new Error('Failed to resolve @qwik.dev/core/handlers.mjs');
        }
        ctx.emitFile({
          id: key.id,
          type: 'chunk',
          preserveSignature: 'allow-extension',
        });
      }

      const qrlMatch = /^(?<parent>.*\.[mc]?[jt]sx?)_(?<name>[^/]+)\.js(?<query>$|\?.*$)/.exec(id)
        ?.groups as { parent: string; name: string; query: string } | undefined;

      /**
       * If this looks like a dev qrl filename, it doesn't matter who imports, we have the parentId
       * embedded.
       */
      if (qrlMatch) {
        const { parent, name, query } = qrlMatch;

        const resolvedParent = await ctx.resolve(parent, importerId, { skipSelf: true });
        if (resolvedParent) {
          // Vite likes to add ?v=1234... to the end of the id
          const parentId = resolvedParent.id.split('?')[0];
          /**
           * A request possibly from the browser. It could be our own QRL request or an import URL
           * generated by vite. In any case, only Vite fully knows how to resolve it. Therefore, we
           * must recombine the resolved parent path with the QRL name.
           */
          const isDevUrl = devServer && importerId?.endsWith('.html');
          const resolvedId = isDevUrl ? `${parentId}_${name}.js` : pathId;
          debug(`resolveId(${count})`, `resolved to QRL ${name} of ${parentId}`);
          // Save for lookup by load()
          parentIds.set(resolvedId, parentId);
          result = {
            id: resolvedId + query,
            // QRL segments can't have side effects. Probably never useful, but it's here for consistency
            moduleSideEffects: false,
          };
        } else {
          console.error(`resolveId(${count})`, `QRL parent ${parent} does not exist!`);
        }
      } else if (importerId) {
        /**
         * When we get here it's neither a virtual module nor a QRL segment. However, Rollup can ask
         * us to resolve imports from QRL segments. It seems like importers need to exist on disk
         * for this to work automatically, so for segments we resolve via the parent instead.
         *
         * Note that when a this happens, the segment was already resolved and transformed, so we
         * know about it.
         */
        const importerParentId = parentIds.get(importerId);
        if (importerParentId) {
          debug(`resolveId(${count}) end`, `resolving via ${importerParentId}`);
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
  ): Promise<Rollup.LoadResult> => {
    if (id === '\0editor') {
      // This doesn't get used, but we need to return something
      return '"opening in editor"';
    }
    if (id.startsWith('\0') || id.startsWith('/@fs/')) {
      return;
    }
    const count = loadCount++;
    const isServer = getIsServer(loadOpts);

    // Virtual modules
    if (opts.resolveQwikBuild && id === QWIK_BUILD_ID) {
      debug(`load(${count})`, QWIK_BUILD_ID, opts.buildMode);
      return {
        moduleSideEffects: false,
        code: getQwikBuildModule(isServer, opts.target),
      };
    }
    if (id === QWIK_CLIENT_MANIFEST_ID) {
      debug(`load(${count})`, QWIK_CLIENT_MANIFEST_ID, opts.buildMode);
      return {
        moduleSideEffects: false,
        code: await getQwikServerManifestModule(isServer),
      };
    }
    /**
     * In dev mode, we need a path to core for qrls. However, we don't know what that is. By
     * re-exporting the core symbols, we let Vite provide the correct path to core and we prevent
     * duplicate Qwik instances.
     */
    if (id === QWIK_HANDLERS_ID) {
      debug(`load(${count})`, QWIK_HANDLERS_ID, opts.buildMode);
      return {
        moduleSideEffects: false,
        code: `export * from '@qwik.dev/core';`,
      };
    }

    // QRL segments
    const parsedId = parseId(id);
    id = normalizePath(parsedId.pathId);
    const outputs = isServer ? serverTransformedOutputs : clientTransformedOutputs;
    if (devServer && !outputs.has(id)) {
      // in dev mode, it could be that the id is a QRL segment that wasn't transformed yet
      const parentId = parentIds.get(id);
      if (parentId) {
        const parentModule = devServer.moduleGraph.getModuleById(parentId);
        if (parentModule) {
          // building here via ctx.load doesn't seem to work (no transform), instead we use the devserver directly
          debug(`load(${count})`, 'transforming QRL parent', parentId);
          // We need to encode it as an absolute path
          await devServer.transformRequest(parentModule.url);
          // The QRL segment should exist now
          if (!outputs.has(id)) {
            debug(`load(${count})`, `QRL segment ${id} not found in ${parentId}`);
            return null;
          }
        } else {
          console.error(`load(${count})`, `${parentModule} does not exist!`);
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
    transformOpts = {} as Parameters<Extract<Plugin['transform'], Function>>[2]
  ): Promise<Rollup.TransformResult> {
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
      let devPath: string | undefined;
      if (devServer) {
        devPath = devServer.moduleGraph.getModuleById(pathId)?.url;
      }
      const transformOpts: TransformModulesOptions = {
        input: [{ code, path: filePath, devPath }],
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

      const now = Date.now();
      const newOutput = await optimizer.transformModules(transformOpts);
      debug(`transform(${count})`, `done in ${Date.now() - now}ms`);
      const module = newOutput.modules.find((mod) => !isAdditionalFile(mod))!;

      // uncomment to show transform results
      // debug({ isServer, strip }, transformOpts, newOutput);
      diagnosticsCallback(newOutput.diagnostics, optimizer, srcDir);

      if (isServer) {
        if (newOutput.diagnostics.length === 0 && linter) {
          linter.lint(ctx, code, id);
        }
      } else {
        clientResults.set(id, newOutput);
      }
      const deps = new Set<string>();
      for (const mod of newOutput.modules) {
        if (mod !== module) {
          const key = normalizePath(path.join(srcDir, mod.path));
          debug(`transform(${count})`, `segment ${key}`, mod.segment!.displayName);
          parentIds.set(key, id);
          currentOutputs.set(key, [mod, id]);
          deps.add(key);
          if (opts.target === 'client' && !devServer) {
            // rollup must be told about all entry points
            ctx.emitFile({
              id: key,
              type: 'chunk',
              preserveSignature: 'allow-extension',
            });
          }
        }
      }

      // Force loading generated submodules into Rollup cache so later
      // unchanged imports are not missing in our internal transform cache
      // This can happen in the repl when the plugin is re-initialized
      // and possibly in other places
      // NOTE: this should be Promise.all to avoid deadlocks
      await Promise.all([...deps.values()].map((id) => ctx.load({ id })));

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

  type OutputAnalyzer = {
    addInjection: (b: GlobalInjections) => void;
    generateManifest: (extra?: Partial<QwikManifest>) => Promise<QwikManifest>;
    canonPath: (p: string) => string;
  };

  const createOutputAnalyzer = (rollupBundle: Rollup.OutputBundle) => {
    const injections: GlobalInjections[] = [];

    const outputAnalyzer: OutputAnalyzer = {
      addInjection: (b: GlobalInjections) => injections.push(b),
    } as Partial<OutputAnalyzer> as OutputAnalyzer;

    outputAnalyzer.generateManifest = async (extra?: Partial<QwikManifest>) => {
      const optimizer = getOptimizer();
      const path = optimizer.sys.path;

      const buildPath = path.resolve(opts.rootDir, opts.outDir, 'build');
      const canonPath = (p: string) =>
        path.relative(buildPath, path.resolve(opts.rootDir, opts.outDir, p));
      outputAnalyzer.canonPath = canonPath;

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
        debug,
        canonPath
      );
      if (extra) {
        Object.assign(manifest, extra);
      }

      for (const symbol of Object.values(manifest.symbols)) {
        if (symbol.origin) {
          symbol.origin = normalizePath(symbol.origin);
        }
      }

      for (const bundle of Object.values(manifest.bundles)) {
        if (bundle.origins) {
          bundle.origins = bundle.origins.sort();
        }
      }

      manifest.manifestHash = hashCode(JSON.stringify(manifest));

      return manifest;
    };

    return outputAnalyzer;
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

  /** Convert windows backslashes to forward slashes if possible */
  const normalizePath = (id: string) => lazyNormalizePath(id);

  function getQwikBuildModule(isServer: boolean, _target: QwikBuildTarget) {
    const isDev = opts.buildMode === 'development';
    return `// @qwik.dev/core/build
export const isServer = ${JSON.stringify(isServer)};
export const isBrowser = ${JSON.stringify(!isServer)};
export const isDev = ${JSON.stringify(isDev)};
`;
  }

  async function getQwikServerManifestModule(isServer: boolean) {
    if (
      !opts.manifestInput &&
      opts.target === 'ssr' &&
      opts.buildMode === 'production' &&
      maybeFs
    ) {
      const path = getPath();
      let clientManifestPath = path.resolve(opts.clientOutDir, Q_MANIFEST_FILENAME);
      if (!(await maybeFs.promises.stat(clientManifestPath).catch(() => false))) {
        clientManifestPath = path.resolve(opts.rootDir, CLIENT_OUT_DIR, Q_MANIFEST_FILENAME);
      }
      try {
        const clientManifestStr = await maybeFs.promises.readFile(clientManifestPath, 'utf-8');
        opts.manifestInput = getValidManifest(JSON.parse(clientManifestStr)) || null;
        // eslint-disable-next-line no-console
        console.info('Read client manifest from', clientManifestPath);
      } catch (e) {
        console.warn(
          `\n==========\n` +
            `Could not read Qwik client manifest ${clientManifestPath}.\n` +
            `Make sure you provide it to the SSR renderer via the \`manifest\` argument, or define it in \`globalThis.__QWIK_MANIFEST__\` before the server bundle is loaded, or embed it in the server bundle by replacing \`globalThis.__QWIK_MANIFEST__\`.\n` +
            `Without the manifest, the SSR renderer will not be able to generate event handlers.\n` +
            `(${e})\n` +
            `==========\n`
        );
      }
    }

    const manifest = isServer ? opts.manifestInput : null;
    let serverManifest: ServerQwikManifest | null = null;
    if (manifest?.manifestHash) {
      serverManifest = {
        manifestHash: manifest.manifestHash,
        core: manifest.core,
        preloader: manifest.preloader,
        qwikLoader: manifest.qwikLoader,
        bundleGraphAsset: manifest.bundleGraphAsset,
        injections: manifest.injections,
        mapping: manifest.mapping,
        bundleGraph: manifest.bundleGraph,
      };
    }
    return `// @qwik-client-manifest
export const manifest = ${serverManifest ? JSON.stringify(serverManifest) : 'globalThis.__QWIK_MANIFEST__'};\n`;
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
    }
  }

  const manualChunks: Rollup.ManualChunksOption = (id: string, { getModuleInfo }) => {
    if (opts.target === 'client') {
      if (
        // The preloader has to stay in a separate chunk if it's a client build
        // the vite preload helper must be included or to prevent breaking circular dependencies
        id.endsWith('@qwik.dev/core/build') ||
        /[/\\](core|qwik)[/\\]dist[/\\]preloader\.[cm]js$/.test(id) ||
        id === '\0vite/preload-helper.js'
      ) {
        return 'qwik-preloader';
      } else if (
        // likewise, core and handlers have to be in the same chunk so there's no import waterfall
        /[/\\](core|qwik)[/\\](handlers|dist[/\\]core(\.prod|\.min)?)\.[cm]js$/.test(id)
      ) {
        return 'qwik-core';
      } else if (/[/\\](core|qwik)[/\\]dist[/\\]qwikloader\.js$/.test(id)) {
        return 'qwik-loader';
      }
    }

    const module = getModuleInfo(id);
    if (module) {
      const segment = module.meta.segment as SegmentAnalysis | undefined;
      if (segment) {
        const { hash } = segment;

        // We use the manual entry strategy to group segments together based on their common entry or Qwik Insights provided hash
        const chunkName =
          (opts.entryStrategy as SmartEntryStrategy).manual?.[hash] || segment.entry;
        if (chunkName) {
          // we group related segments together based on their common entry or Qwik Insights provided hash
          // This not only applies to source files, but also qwik libraries files that are imported through node_modules
          return chunkName;
        }
      }

      // The id either points to a context file, inline component, or src .js/.ts util/helper file (or a barrel file but it will be tree-shaken by rollup)
      // Making sure that we return a specific id for those files prevents rollup from bundling unrelated code together
      if (module.meta.qwikdeps?.length === 0) {
        if (id.includes('node_modules')) {
          const idx = id.lastIndexOf('node_modules');
          if (idx >= 0) {
            const relToNodeModules = id.slice(idx + 13);
            return relToNodeModules;
          }
        } else if (opts.srcDir && id.includes(opts.srcDir)) {
          const path = getPath();
          const relToSrcDir = normalizePath(path.relative(opts.srcDir, id));
          return relToSrcDir;
        }
      }
    }

    // The rest is non-qwik code. We let rollup handle it.
    return null;
  };

  async function generateManifest(
    ctx: Rollup.PluginContext,
    rollupBundle: Rollup.OutputBundle,
    bundleGraphAdders?: Set<BundleGraphAdder>,
    manifestExtra?: Partial<QwikManifest>
  ) {
    const outputAnalyzer = createOutputAnalyzer(rollupBundle);
    const manifest = await outputAnalyzer.generateManifest(manifestExtra);

    manifest.platform = {
      ...manifestExtra?.platform,
      rollup: ctx.meta?.rollupVersion || '',
      env: optimizer.sys.env,
      os: optimizer.sys.os,
    };
    if (optimizer.sys.env === 'node') {
      manifest.platform!.node = process.versions.node;
    }

    const bundleGraph = convertManifestToBundleGraph(manifest, bundleGraphAdders);
    const bgAsset = ctx.emitFile({
      type: 'asset',
      name: 'bundle-graph.json',
      source: JSON.stringify(bundleGraph),
    });
    const bgPath = ctx.getFileName(bgAsset);
    manifest.bundleGraphAsset = bgPath;
    // we already generated the assets list so we need to update it
    manifest.assets![bgPath] = {
      name: 'bundle-graph.json',
      size: bundleGraph.length,
    };

    const manifestStr = JSON.stringify(manifest, null, '\t');
    ctx.emitFile({
      fileName: Q_MANIFEST_FILENAME,
      type: 'asset',
      source: manifestStr,
    });

    if (typeof opts.manifestOutput === 'function') {
      await opts.manifestOutput(manifest);
    }

    if (typeof opts.transformedModuleOutput === 'function') {
      await opts.transformedModuleOutput(getTransformedOutputs());
    }
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
    generateManifest,
  };
}

/** Convert windows backslashes to forward slashes */
export const makeNormalizePath = (sys: OptimizerSystem) => (id: string) => {
  if (typeof id === 'string') {
    if (isWin(sys.os)) {
      // MIT https://github.com/sindresorhus/slash/blob/main/license
      // Convert Windows backslash paths to slash paths: foo\\bar ➔ foo/bar
      const isExtendedLengthPath = id.startsWith('\\\\?\\');
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

const TRANSFORM_EXTS = {
  '.jsx': true,
  '.ts': true,
  '.tsx': true,
} as const;

/**
 * Any file that matches this needs to be processed by Qwik to extract QRL segments etc. Used in
 * libraries.
 *
 * @internal
 */
export const TRANSFORM_REGEX = /\.qwik\.[mc]?js$/;

export const QWIK_CORE_ID = '@qwik.dev/core';

export const QWIK_CORE_INTERNAL_ID = '@qwik.dev/core/internal';

export const QWIK_BUILD_ID = '@qwik.dev/core/build';

export const QWIK_JSX_RUNTIME_ID = '@qwik.dev/core/jsx-runtime';

export const QWIK_JSX_DEV_RUNTIME_ID = '@qwik.dev/core/jsx-dev-runtime';

export const QWIK_CORE_SERVER = '@qwik.dev/core/server';

export const QWIK_CLIENT_MANIFEST_ID = '@qwik-client-manifest';

export const QWIK_PRELOADER_ID = '@qwik.dev/core/preloader';

export const QWIK_HANDLERS_ID = '@qwik-handlers';

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
  input?: string[] | string | { [entry: string]: string };
  outDir?: string;
  ssrOutDir?: string;
  clientOutDir?: string;
  assetsDir?: string;
  srcDir?: string | null;
  scope?: string | null;
  /** @deprecated Not used */
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
  extends Omit<
    Required<QwikPluginOptions>,
    'input' | 'vendorRoots' | 'srcInputs' | 'experimental'
  > {
  input: string[] | { [entry: string]: string } | undefined;
  experimental: Record<keyof typeof ExperimentalFeatures, boolean> | undefined;
}

export type QwikPlugin = ReturnType<typeof createQwikPlugin>;

/** @public */
export type QwikBuildTarget = 'client' | 'ssr' | 'lib' | 'test';

/** @public */
export type QwikBuildMode = 'production' | 'development';
