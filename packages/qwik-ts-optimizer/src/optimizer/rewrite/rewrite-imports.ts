/**
 * Import source path rewriting for Qwik package migration.
 *
 * Rewrites legacy @builder.io/* imports to their @qwik.dev/* equivalents.
 * Sub-paths are preserved after the base package is replaced.
 *
 * Sorted by descending length so longer prefixes match first
 * (prevents @builder.io/qwik-city from matching the @builder.io/qwik rule).
 */

const IMPORT_REWRITES: readonly [from: string, to: string][] = [
  ['@builder.io/qwik-react', '@qwik.dev/react'],
  ['@builder.io/qwik-city', '@qwik.dev/router'],
  ['@builder.io/qwik', '@qwik.dev/core'],
];

/**
 * Rewrite an import source path from legacy @builder.io/* to @qwik.dev/*.
 *
 * Exact matches and sub-path imports are rewritten.
 * Non-qwik @builder.io imports pass through unchanged.
 */
export function rewriteImportSource(source: string): string {
  for (const [from, to] of IMPORT_REWRITES) {
    if (source === from || source.startsWith(from + '/')) {
      return to + source.slice(from.length);
    }
  }
  return source;
}
