import type { SsgGenerateOptions, SsgOptions, SsgRenderOptions, SsgResult } from './types';
import { mainThread } from './orchestrator';

// @qwik.dev/router/ssg

/**
 * Use this function when SSG should be generated from another module, such as a Vite plugin. This
 * function's should be passed the paths of the entry module and Qwik Router Plan.
 *
 * @public
 */
export async function generate(opts: SsgGenerateOptions) {
  const { createSystem } = await import('./system');
  const sys = await createSystem(opts);
  return mainThread(sys);
}

/**
 * Run SSG as a standalone process. Writes `_static-paths.json` to `outDir` and exits with code 0 on
 * success, 1 on error.
 *
 * Intended to be called from a generated `run-ssg.js` wrapper that provides render/config.
 *
 * @public
 */
export async function runSsg(opts: SsgGenerateOptions): Promise<never> {
  try {
    const result = await generate(opts);

    // Write static paths for the adapter/post-build to consume
    const fs = await import('node:fs');
    const { join } = await import('node:path');
    const staticPathsFile = join(opts.outDir, '_static-paths.json');
    await fs.promises.writeFile(staticPathsFile, JSON.stringify(result.staticPaths));

    if (result.errors > 0) {
      console.error(`SSG completed with ${result.errors} error(s)`);
      process.exit(1);
    }
    process.exit(0);
  } catch (e) {
    console.error('SSG failed:', e);
    process.exit(1);
  }
}

/**
 * Bootstrap a worker thread for SSG rendering. Called from the generated `run-ssg.js` when it
 * detects it's running as a worker thread.
 *
 * @param opts - Must include `render` and `qwikRouterConfig` (imported by the worker entry). The
 *   remaining serializable options come from `workerData`.
 * @public
 */
export async function startWorker(opts: Pick<SsgGenerateOptions, 'render' | 'qwikRouterConfig'>) {
  const { workerData } = await import('node:worker_threads');
  // Merge the serializable workerData with the directly-imported render/config
  const mergedOpts: SsgGenerateOptions = {
    ...workerData,
    render: opts.render,
    qwikRouterConfig: opts.qwikRouterConfig,
  };
  const { createSystem } = await import('./system');
  const { workerThread } = await import('./worker-thread');
  const sys = await createSystem(mergedOpts, workerData?.threadId);
  await workerThread(sys);
}

export type {
  SsgOptions as StaticGenerateOptions,
  SsgOptions,
  SsgGenerateOptions as SsgInternalOptions,
  SsgRenderOptions,
  SsgResult as StaticGenerateResult,
};
