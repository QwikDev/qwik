const QWIK_LOADER_DEFAULT_MINIFIED: string = (globalThis as any).QWIK_LOADER_DEFAULT_MINIFIED;
const QWIK_LOADER_DEFAULT_DEBUG: string = (globalThis as any).QWIK_LOADER_DEFAULT_DEBUG;

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
