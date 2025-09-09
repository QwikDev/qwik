const QWIK_LOADER_DEFAULT_MINIFIED: string = (globalThis as any).QWIK_LOADER_DEFAULT_MINIFIED;
const QWIK_LOADER_DEFAULT_DEBUG: string = (globalThis as any).QWIK_LOADER_DEFAULT_DEBUG;

const QWIK_BACKPATCH_EXECUTOR_MINIFIED: string = (globalThis as any)
  .QWIK_BACKPATCH_EXECUTOR_MINIFIED;
const QWIK_BACKPATCH_EXECUTOR_DEBUG: string = (globalThis as any).QWIK_BACKPATCH_EXECUTOR_DEBUG;

/**
 * Provides the `qwikloader.js` file as a string. Useful for tooling to inline the qwikloader script
 * into HTML.
 *
 * @public
 */
export function getQwikLoaderScript(opts: { debug?: boolean } = {}) {
  // default script selector behavior
  return opts.debug ? QWIK_LOADER_DEFAULT_DEBUG : QWIK_LOADER_DEFAULT_MINIFIED;
}

const QWIK_PREFETCH_MINIFIED: string = (globalThis as any).QWIK_PREFETCH_MINIFIED;
const QWIK_PREFETCH_DEBUG: string = (globalThis as any).QWIK_PREFETCH_DEBUG;

/**
 * Provides the `qwik-prefetch-service-worker.js` file as a string. Useful for tooling to inline the
 * qwik-prefetch-service-worker script into HTML.
 *
 * @public
 */
export function getQwikPrefetchWorkerScript(opts: { debug?: boolean } = {}) {
  return opts.debug ? QWIK_PREFETCH_DEBUG : QWIK_PREFETCH_MINIFIED;
}

/**
 * Provides the `backpatch-executor.js` executor script as a string.
 *
 * @public
 */
export function getQwikBackpatchExecutorScript(opts: { debug?: boolean } = {}) {
  return opts.debug ? QWIK_BACKPATCH_EXECUTOR_DEBUG : QWIK_BACKPATCH_EXECUTOR_MINIFIED;
}
