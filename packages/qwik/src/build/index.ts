/**
 * True when build is made for SSR purposes.
 *
 * @alpha
 */
export const isServer: boolean = /*#__PURE__*/ (() => (typeof process !== "undefined" && !!process.versions && !!process.versions.node) || (typeof Deno !== 'undefined'))();

/**
 * True when build is made for browser, client-side execution.
 *
 * @alpha
 */
export const isBrowser: boolean = /*#__PURE__*/ (() => (typeof window !== "undefined" && !!window.document) || (typeof self !== 'undefined' && typeof self.importScripts === 'function'))();
 
declare const Deno: any;
declare const self: any;