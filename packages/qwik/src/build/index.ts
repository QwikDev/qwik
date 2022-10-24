/**
 * True when build is made for browser, client-side execution.
 *
 * @alpha
 */
export const isBrowser: boolean = /*#__PURE__*/ (() => (
  typeof window !== "undefined" &&
  typeof HTMLElement !== "undefined" &&
  !!window.document &&
  String(HTMLElement).includes('[native code]')
))();

/**
 * True when build is made for SSR purposes.
 *
 * @alpha
 */
export const isServer: boolean = !isBrowser;
