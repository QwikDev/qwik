/**
 * True when build is made for SSR purposes
 *
 * @alpha
 */
export const isServer: boolean = /*#__PURE__*/ (() => typeof process !== "undefined" &&
  process.versions != null &&
  process.versions.node != null
)();


/**
 * True when build is made for browser, client-side execution
 *
 * @alpha
 */
export const isBrowser: boolean = /*#__PURE__*/ (() => typeof window !== "undefined" && window.document != null)();
