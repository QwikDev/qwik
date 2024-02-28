/**
 * True when build is made for browser, client-side execution.
 *
 * @public
 */
export const isBrowser: boolean = /*#__PURE__*/ (() =>
  typeof window !== 'undefined' &&
  typeof HTMLElement !== 'undefined' &&
  !!window.document &&
  String(HTMLElement).includes('[native code]'))();

/**
 * True when build is made for SSR purposes.
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
