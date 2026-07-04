import type { OutputOptions } from 'rolldown';
import type { Rolldown } from 'vite';
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
import { createRolldownError, flattenToChunkName, isVirtualId } from './vite-utils';

type QwikRolldownPluginApi = {
  getOptimizer: () => Optimizer;
  getOptions: () => NormalizedQwikPluginOptions;
};

/** @public */
export function qwikRolldown(qwikRolldownOpts: QwikRolldownPluginOptions = {}): any {
  const qwikPlugin = createQwikPlugin(qwikRolldownOpts.optimizerOptions);

  const rolldownPlugin: QwikRolldownPlugin = {
    name: 'rolldown-plugin-qwik',

    api: {
      getOptimizer: () => qwikPlugin.getOptimizer(),
      getOptions: () => qwikPlugin.getOptions(),
    },

    async options(inputOpts) {
      await qwikPlugin.init();

      const pluginOpts: QwikPluginOptions = {
        csr: qwikRolldownOpts.csr,
        target: qwikRolldownOpts.target,
        buildMode: qwikRolldownOpts.buildMode,
        debug: qwikRolldownOpts.debug,
        entryStrategy: qwikRolldownOpts.entryStrategy,
        rootDir: qwikRolldownOpts.rootDir,
        srcDir: qwikRolldownOpts.srcDir,
        srcInputs: qwikRolldownOpts.srcInputs,
        input: inputOpts.input as string,
        resolveQwikBuild: true,
        manifestOutput: qwikRolldownOpts.manifestOutput,
        manifestInput: qwikRolldownOpts.manifestInput,
        transformedModuleOutput: qwikRolldownOpts.transformedModuleOutput,
        inlineStylesUpToBytes: qwikRolldownOpts.optimizerOptions?.inlineStylesUpToBytes,
        lint: qwikRolldownOpts.lint,
        experimental: qwikRolldownOpts.experimental,
      };

      await qwikPlugin.normalizeOptions(pluginOpts);
      // Override the input with the normalized input
      const { input } = qwikPlugin.getOptions();
      inputOpts.input = input;

      return inputOpts;
    },

    outputOptions(outputOpts) {
      return normalizeRolldownOutputObject(
        qwikPlugin,
        outputOpts,
        qwikPlugin.getOptions().outDir
      ) as any;
    },

    async buildStart() {
      qwikPlugin.onDiagnostics((diagnostics, optimizer, srcDir) => {
        diagnostics.forEach((d) => {
          const id = qwikPlugin.normalizePath(optimizer.sys.path.join(srcDir, d.file));
          if (d.category === 'error') {
            this.error(createBundlerError(id, d));
          } else {
            this.warn(createBundlerError(id, d));
          }
        });
      });

      await qwikPlugin.buildStart(this);
    },

    resolveId(id, importer) {
      if (isVirtualId(id)) {
        return null;
      }
      return qwikPlugin.resolveId(this, id, importer);
    },

    load(id) {
      if (isVirtualId(id)) {
        return null;
      }
      return qwikPlugin.load(this, id);
    },

    transform(code, id) {
      if (isVirtualId(id)) {
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

  return rolldownPlugin;
}

export async function normalizeRolldownOutputOptions(
  qwikPlugin: QwikPlugin,
  outputOpts: OutputOptions | OutputOptions[] | undefined
): Promise<OutputOptions | OutputOptions[]> {
  if (Array.isArray(outputOpts)) {
    // make sure at least one output is present in every case
    if (!outputOpts.length) {
      outputOpts.push({});
    }

    return await Promise.all(
      outputOpts.map((outputOptsObj) => normalizeRolldownOutputObject(qwikPlugin, outputOptsObj))
    );
  }

  return normalizeRolldownOutputObject(qwikPlugin, outputOpts);
}

const normalizeChunkPathPrefix = (prefix: string) => {
  if (!prefix) {
    return '';
  }
  return `${prefix.replace(/\/+$/, '')}/`;
};

export const getChunkPathPrefix = (prefix: string) => {
  return `${normalizeChunkPathPrefix(prefix)}build/`;
};

const getChunkFileName = (
  prefix: string,
  opts: NormalizedQwikPluginOptions,
  optimizer: Optimizer
) => {
  const chunkPathPrefix = getChunkPathPrefix(prefix);
  if (opts.buildMode === 'production' && !opts.debug) {
    return `${chunkPathPrefix}q-[hash].js`;
  } else {
    // Friendlier names in dev or preview with debug mode
    return (chunkInfo: Rolldown.PreRenderedChunk) => {
      if (chunkInfo.moduleIds?.some((id) => /core\.(prod|min)\.mjs$/.test(id))) {
        return `${chunkPathPrefix}core.js`;
      }
      if (chunkInfo.moduleIds?.some((id) => /qwik-router\/lib\/index\.qwik\.mjs$/.test(id))) {
        return `${chunkPathPrefix}qwik-router.js`;
      }

      // The chunk name can often be a path. We sanitize it to use dashes instead of slashes, to keep the same folder structure as without debug:true.
      // Besides, the bundler doesn't accept absolute or relative paths as inputs for the [name] placeholder for the same reason.
      const relativePath = optimizer.sys.path.relative(optimizer.sys.cwd(), chunkInfo.name);
      return `${chunkPathPrefix}${flattenToChunkName(relativePath)}.js`;
    };
  }
};

export async function normalizeRolldownOutputObject(
  qwikPlugin: QwikPlugin,
  rolldownOutputOptsObj: OutputOptions | undefined,
  // Force `dir` for the standalone plugin (no Vite to derive it). Vite passes undefined so
  // each environment's `build.outDir` resolves it — letting a custom env (e.g. `ssg`) use its own.
  outDir?: string
): Promise<OutputOptions> {
  const outputOpts: OutputOptions = { ...rolldownOutputOptsObj };
  const opts = qwikPlugin.getOptions();
  const optimizer = qwikPlugin.getOptimizer();
  const internalCodeSplitting = qwikPlugin.codeSplitting(opts.target);

  if (!outputOpts.assetFileNames) {
    // SEO likes readable asset names. Set `output.assetFileNames` to relocate assets.
    outputOpts.assetFileNames = 'assets/[hash]-[name].[ext]';
  }

  // Qwik's lazy JS chunks stay at `build/` (the preloader's fixed home) regardless of asset config.
  const chunkFileName = getChunkFileName('', opts, optimizer);
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
  } else {
    // server production output, try to be similar to client
    if (!outputOpts.chunkFileNames) {
      outputOpts.chunkFileNames = chunkFileName;
    }
  }

  // Custom chunking groups related qrl segments; same config for client and server.
  const userCodeSplitting = outputOpts.codeSplitting;
  if (typeof userCodeSplitting === 'boolean') {
    throw new Error(
      'codeSplitting must be a `codeSplitting: { groups: [...] }` object so Qwik can group qrl segments back together without causing network waterfalls.'
    );
  }
  outputOpts.codeSplitting = {
    includeDependenciesRecursively: internalCodeSplitting.includeDependenciesRecursively,
    groups: [...(internalCodeSplitting.groups ?? []), ...(userCodeSplitting?.groups ?? [])],
  };

  if (!outputOpts.dir && outDir) {
    outputOpts.dir = outDir;
  }

  if (outputOpts.format === 'cjs' && typeof outputOpts.exports !== 'string') {
    outputOpts.exports = 'auto';
  }

  return outputOpts;
}

export function createBundlerError(id: string, diagnostic: Diagnostic) {
  const loc = diagnostic.highlights?.[0];
  return createRolldownError(
    diagnostic.message,
    id,
    'qwik',
    loc && { column: loc.startCol, line: loc.startLine }
  );
}

/** @public */
export interface QwikRolldownPluginOptions {
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
type P<T> = Rolldown.Plugin<T> & { api: T };
export interface QwikRolldownPlugin extends P<QwikRolldownPluginApi> {}

/**
 * Renamed to `qwikRolldown` — Rollup support was dropped in the Vite 8 migration.
 *
 * @deprecated Use `qwikRolldown`.
 * @public
 */
export const qwikRollup = qwikRolldown;
/**
 * Renamed to `QwikRolldownPluginOptions`.
 *
 * @deprecated Use `QwikRolldownPluginOptions`.
 * @public
 */
export type QwikRollupPluginOptions = QwikRolldownPluginOptions;
