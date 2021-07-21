const QWIK_LOADER_DEFAULT_MINIFIED: string = (global as any).QWIK_LOADER_DEFAULT_MINIFIED;
const QWIK_LOADER_DEFAULT_DEBUG: string = (global as any).QWIK_LOADER_DEFAULT_DEBUG;
const QWIK_LOADER_OPTIMIZE_MINIFIED: string = (global as any).QWIK_LOADER_OPTIMIZE_MINIFIED;
const QWIK_LOADER_OPTIMIZE_DEBUG: string = (global as any).QWIK_LOADER_OPTIMIZE_DEBUG;

/**
 * Provides the qwikloader.js file as a string. Useful for tooling to inline the qwikloader
 * script into HTML.
 * @alpha
 */
export function getQwikLoaderScript(opts: { events?: string[]; debug?: boolean } = {}) {
  if (Array.isArray(opts.events) && opts.events.length > 0) {
    // inject exact known events used
    const loader = opts.debug ? QWIK_LOADER_OPTIMIZE_DEBUG : QWIK_LOADER_OPTIMIZE_MINIFIED;
    return loader.replace('window.qEvents', JSON.stringify(opts.events));
  }

  // default script selector behavior
  return opts.debug ? QWIK_LOADER_DEFAULT_DEBUG : QWIK_LOADER_DEFAULT_MINIFIED;
}
