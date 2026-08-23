/**
 * Oxc-walker statically imports `createRequire` for a lazy parser fallback it only reaches from
 * `parseAndWalk`, which the REPL never calls — but the static import alone breaks the browser
 * bundle. Throwing beats a silent stub if that ever changes.
 */
export function createRequire(): never {
  throw new Error('node:module createRequire is not available in the browser REPL');
}
