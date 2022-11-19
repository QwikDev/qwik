const QWIK_LOADER_DEFAULT_MINIFIED: string = (global as any).QWIK_LOADER_DEFAULT_MINIFIED;
const QWIK_LOADER_DEFAULT_DEBUG: string = (global as any).QWIK_LOADER_DEFAULT_DEBUG;

/**
 * Provides the qwikloader.js file as a string. Useful for tooling to inline the qwikloader
 * script into HTML.
 * @alpha
 */
export function getQwikLoaderScript(opts: { debug?: boolean } = {}) {
  // default script selector behavior
  return opts.debug ? QWIK_LOADER_DEFAULT_DEBUG : QWIK_LOADER_DEFAULT_MINIFIED;
}
