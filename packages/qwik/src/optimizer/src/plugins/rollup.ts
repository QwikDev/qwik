import type { Rollup } from 'vite';

import type {
  Diagnostic,
  EntryStrategy,
  Optimizer,
  OptimizerOptions,
  QwikManifest,
  TransformModule,
  TransformModuleInput,
} from '../types';
import {
  createQwikPlugin,
  type ExperimentalFeatures,
  type NormalizedQwikPluginOptions,
  type QwikBuildMode,
  type QwikBuildTarget,
  type QwikPlugin,
  type QwikPluginOptions,
} from './plugin';

type QwikRollupPluginApi = {
  getOptimizer: () => Optimizer;
  getOptions: () => NormalizedQwikPluginOptions;
};

/** @public */
export function qwikRollup(qwikRollupOpts: QwikRollupPluginOptions = {}): any {
  const qwikPlugin = createQwikPlugin(qwikRollupOpts.optimizerOptions);

  const rollupPlugin: QwikRollupPlugin = {
    name: 'rollup-plugin-qwik',

    api: {
      getOptimizer: () => qwikPlugin.getOptimizer(),
      getOptions: () => qwikPlugin.getOptions(),
    },

    async options(inputOpts) {
      await qwikPlugin.init();

      const origOnwarn = inputOpts.onwarn;
      inputOpts.onwarn = (warning, warn) => {
        if (warning.plugin === 'typescript' && warning.message.includes('outputToFilesystem')) {
          return;
        }
        origOnwarn ? origOnwarn(warning, warn) : warn(warning);
      };

      const pluginOpts: QwikPluginOptions = {
        csr: qwikRollupOpts.csr,
        target: qwikRollupOpts.target,
        buildMode: qwikRollupOpts.buildMode,
        debug: qwikRollupOpts.debug,
        entryStrategy: qwikRollupOpts.entryStrategy,
        rootDir: qwikRollupOpts.rootDir,
        srcDir: qwikRollupOpts.srcDir,
        srcInputs: qwikRollupOpts.srcInputs,
        input: inputOpts.input as string,
        resolveQwikBuild: true,
        manifestOutput: qwikRollupOpts.manifestOutput,
        manifestInput: qwikRollupOpts.manifestInput,
        transformedModuleOutput: qwikRollupOpts.transformedModuleOutput,
        inlineStylesUpToBytes: qwikRollupOpts.optimizerOptions?.inlineStylesUpToBytes,
        lint: qwikRollupOpts.lint,
        experimental: qwikRollupOpts.experimental,
      };

      await qwikPlugin.normalizeOptions(pluginOpts);
      // Override the input with the normalized input
      const { input } = qwikPlugin.getOptions();
      inputOpts.input = input;

      return inputOpts;
    },

    outputOptions(rollupOutputOpts) {
      return normalizeRollupOutputOptionsObject(qwikPlugin, rollupOutputOpts, false);
    },

    async buildStart() {
      qwikPlugin.onDiagnostics((diagnostics, optimizer, srcDir) => {
        diagnostics.forEach((d) => {
          const id = qwikPlugin.normalizePath(optimizer.sys.path.join(srcDir, d.file));
          if (d.category === 'error') {
            this.error(createRollupError(id, d));
          } else {
            this.warn(createRollupError(id, d));
          }
        });
      });

      await qwikPlugin.buildStart(this);
    },

    resolveId(id, importer) {
      if (id.startsWith('\0')) {
        return null;
      }
      return qwikPlugin.resolveId(this, id, importer);
    },

    load(id) {
      if (id.startsWith('\0')) {
        return null;
      }
      return qwikPlugin.load(this, id);
    },

    transform(code, id) {
      if (id.startsWith('\0')) {
        return null;
      }
      return qwikPlugin.transform(this, code, id);
    },

    async generateBundle(_, rollupBundle) {
      const opts = qwikPlugin.getOptions();

      if (opts.target === 'client') {
        await qwikPlugin.generateManifest(this, rollupBundle);
      }
    },
  };

  return rollupPlugin;
}

export function normalizeRollupOutputOptions(
  qwikPlugin: QwikPlugin,
  rollupOutputOpts: Rollup.OutputOptions | Rollup.OutputOptions[] | undefined,
  useAssetsDir: boolean,
  outDir?: string
): Rollup.OutputOptions | Rollup.OutputOptions[] {
  if (Array.isArray(rollupOutputOpts)) {
    // make sure at least one output is present in every case
    if (!rollupOutputOpts.length) {
      rollupOutputOpts.push({});
    }

    return rollupOutputOpts.map((outputOptsObj) => ({
      ...normalizeRollupOutputOptionsObject(qwikPlugin, outputOptsObj, useAssetsDir),
      dir: outDir || outputOptsObj.dir,
    }));
  }

  return {
    ...normalizeRollupOutputOptionsObject(qwikPlugin, rollupOutputOpts, useAssetsDir),
    dir: outDir || rollupOutputOpts?.dir,
  };
}

const getChunkFileName = (
  prefix: string,
  opts: NormalizedQwikPluginOptions,
  optimizer: Optimizer
) => {
  if (opts.buildMode === 'production' && !opts.debug) {
    return `${prefix}build/q-[hash].js`;
  } else {
    // Friendlier names in dev or preview with debug mode
    return (chunkInfo: Rollup.PreRenderedChunk) => {
      if (chunkInfo.moduleIds?.some((id) => /core\.(prod|min)\.mjs$/.test(id))) {
        return `${prefix}build/core.js`;
      }
      if (chunkInfo.moduleIds?.some((id) => /qwik-router\/lib\/index\.qwik\.mjs$/.test(id))) {
        return `${prefix}build/qwik-router.js`;
      }

      // The chunk name can often be a path. We sanitize it to use dashes instead of slashes, to keep the same folder structure as without debug:true.
      // Besides, Rollup doesn't accept absolute or relative paths as inputs for the [name] placeholder for the same reason.
      const relativePath = optimizer.sys.path.relative(optimizer.sys.cwd(), chunkInfo.name);
      const sanitized = relativePath
        .replace(/^(\.\.\/)+/, '')
        .replace(/^\/+/, '')
        .replace(/\//g, '-');
      return `${prefix}build/${sanitized}.js`;
    };
  }
};

export function normalizeRollupOutputOptionsObject(
  qwikPlugin: QwikPlugin,
  rollupOutputOptsObj: Rollup.OutputOptions | undefined,
  useAssetsDir: boolean
): Rollup.OutputOptions {
  const outputOpts: Rollup.OutputOptions = { ...rollupOutputOptsObj };
  const opts = qwikPlugin.getOptions();
  const optimizer = qwikPlugin.getOptimizer();
  const manualChunks = qwikPlugin.manualChunks;

  if (!outputOpts.assetFileNames) {
    // SEO likes readable asset names
    // assetsDir allows assets to be in a deeper directory for serving, e.g. Astro
    outputOpts.assetFileNames = `${useAssetsDir ? `${opts.assetsDir}/` : ''}assets/[hash]-[name].[ext]`;
  }

  const chunkFileName = getChunkFileName(useAssetsDir ? `${opts.assetsDir}` : '', opts, optimizer);
  if (opts.target === 'client') {
    // client output
    if (!outputOpts.entryFileNames) {
      // we don't treat entries specially for the client
      outputOpts.entryFileNames = chunkFileName;
    }
    if (!outputOpts.chunkFileNames) {
      outputOpts.chunkFileNames = chunkFileName;
    }

    // client should always be es
    outputOpts.format = 'es';
    const prevManualChunks = outputOpts.manualChunks;
    if (prevManualChunks && typeof prevManualChunks !== 'function') {
      throw new Error('manualChunks must be a function');
    }

    // We need custom chunking for the client build
    outputOpts.manualChunks = prevManualChunks
      ? (id, meta) => prevManualChunks(id, meta) || manualChunks(id, meta)
      : manualChunks;
  } else {
    // server production output, try to be similar to client
    if (!outputOpts.chunkFileNames) {
      outputOpts.chunkFileNames = chunkFileName;
    }
  }

  if (!outputOpts.dir) {
    outputOpts.dir = opts.outDir;
  }

  if (outputOpts.format === 'cjs' && typeof outputOpts.exports !== 'string') {
    outputOpts.exports = 'auto';
  }

  /**
   * Transitive imports must not be hoisted. Otherwise, the bundle-graph static imports will be
   * incorrect; leading to over-preloading.
   */
  outputOpts.hoistTransitiveImports = false;

  return outputOpts;
}

export function createRollupError(id: string, diagnostic: Diagnostic) {
  const loc = diagnostic.highlights?.[0];
  const err: Rollup.RollupError = Object.assign(new Error(diagnostic.message), {
    id,
    plugin: 'qwik',
    loc: loc && {
      column: loc.startCol,
      line: loc.startLine,
    },
    stack: '',
  });
  return err;
}

/** @public */
export interface QwikRollupPluginOptions {
  csr?: boolean;
  /**
   * Build `production` or `development`.
   *
   * Default `development`
   */
  buildMode?: QwikBuildMode;
  /**
   * Target `client` or `ssr`.
   *
   * Default `client`
   */
  target?: QwikBuildTarget;
  /**
   * Prints verbose Qwik plugin debug logs.
   *
   * Default `false`
   */
  debug?: boolean;
  /**
   * The Qwik entry strategy to use while building for production. During development the type is
   * always `segment`.
   *
   * Default `{ type: "smart" }`)
   */
  entryStrategy?: EntryStrategy;
  /**
   * The source directory to find all the Qwik components. Since Qwik does not have a single input,
   * the `srcDir` is used to recursively find Qwik files.
   *
   * Default `src`
   */
  srcDir?: string;
  /**
   * Alternative to `srcDir`, where `srcInputs` is able to provide the files manually. This option
   * is useful for an environment without a file system, such as a webworker.
   *
   * Default: `null`
   */
  srcInputs?: TransformModuleInput[] | null;
  /**
   * The root of the application, which is commonly the same directory as `package.json` and
   * `rollup.config.js`.
   *
   * Default `process.cwd()`
   */
  rootDir?: string;
  /**
   * The client build will create a manifest and this hook is called with the generated build data.
   *
   * Default `undefined`
   */
  manifestOutput?: (manifest: QwikManifest) => Promise<void> | void;
  /**
   * The SSR build requires the manifest generated during the client build. The `manifestInput`
   * option can be used to manually provide a manifest.
   *
   * Default `undefined`
   */
  manifestInput?: QwikManifest;
  optimizerOptions?: OptimizerOptions;
  /**
   * Hook that's called after the build and provides all of the transformed modules that were used
   * before bundling.
   */
  transformedModuleOutput?:
    | ((transformedModules: TransformModule[]) => Promise<void> | void)
    | null;
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
export { ExperimentalFeatures } from './plugin';
type P<T> = Rollup.Plugin<T> & { api: T };
export interface QwikRollupPlugin extends P<QwikRollupPluginApi> {}
