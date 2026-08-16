/**
 * Oxc-walker statically imports `createRequire` for a lazy parser fallback it only reaches when no
 * `parseSync` is available. The REPL always has oxc-parser, so this never runs — but the static
 * import alone breaks the browser bundle. Throwing beats a silent stub if that ever changes.
 */
export function createRequire(): never {
  throw new Error('node:module createRequire is not available in the browser REPL');
}
