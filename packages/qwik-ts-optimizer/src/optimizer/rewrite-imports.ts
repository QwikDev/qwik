/**
 * Import source path rewriting for Qwik package migration.
 *
 * Rewrites legacy @builder.io/* imports to their @qwik.dev/* equivalents.
 * Sub-paths are preserved after the base package is replaced.
 *
 * Implements IMP-01 (@builder.io/qwik -> @qwik.dev/core)
 * Implements IMP-02 (@builder.io/qwik-city -> @qwik.dev/router)
 * Implements IMP-03 (@builder.io/qwik-react -> @qwik.dev/react)
 */

/**
 * Rewrite rules mapping old @builder.io package names to new @qwik.dev names.
 *
 * IMPORTANT: Sorted by descending length of the `from` key so longer prefixes
 * match first. This prevents @builder.io/qwik-city from incorrectly matching
 * the @builder.io/qwik rule.
 */
const IMPORT_REWRITES: readonly [string, string][] = [
  ['@builder.io/qwik-react', '@qwik.dev/react'],
  ['@builder.io/qwik-city', '@qwik.dev/router'],
  ['@builder.io/qwik', '@qwik.dev/core'],
];

/**
 * Rewrite an import source path from legacy @builder.io/* to @qwik.dev/*.
 *
 * - Exact matches are rewritten (e.g., @builder.io/qwik -> @qwik.dev/core)
 * - Sub-path imports are preserved (e.g., @builder.io/qwik/build -> @qwik.dev/core/build)
 * - Non-qwik @builder.io imports are NOT rewritten (e.g., @builder.io/sdk stays)
 * - Already-new imports pass through unchanged (e.g., @qwik.dev/core stays)
 *
 * @param source - The import source string to potentially rewrite
 * @returns The rewritten source, or the original if no rewrite applies
 */
export function rewriteImportSource(source: string): string {
  for (const [from, to] of IMPORT_REWRITES) {
    if (source === from || source.startsWith(from + '/')) {
      return to + source.slice(from.length);
    }
  }
  return source;
}
