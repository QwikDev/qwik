/**
 * True when build is made for browser, client-side execution.
 *
 * @public
 */
export const isBrowser: boolean = /*#__PURE__*/ (() =>
  (typeof window !== 'undefined' &&
    typeof HTMLElement !== 'undefined' &&
    !!window.document &&
    String(HTMLElement).includes('[native code]')) ||
  (typeof WorkerGlobalScope !== 'undefined' &&
    typeof self !== 'undefined' &&
    self instanceof WorkerGlobalScope))();

/**
 * True when build is made for non-browser execution.
 *
 * @public
 */
export const isServer: boolean = !isBrowser;

/**
 * True when build is in dev mode.
 *
 * @public
 */
export const isDev: boolean = /*#__PURE__*/ (() => {
  return (globalThis as any).qDev === true;
})();
