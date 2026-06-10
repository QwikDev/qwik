/**
 * Stripped-segment code generation for server/client mode.
 *
 * The companion predicate `isStrippedSegment` lives in
 * `rewrite/predicates.ts` alongside the other extraction predicates.
 * Implements MODE-04, MODE-05 codegen.
 */

/**
 * Generate the code for a stripped segment module.
 *
 * Format (verified from example_strip_server_code snapshot):
 * ```
 * export const {symbolName} = null;
 * ```
 */
export function generateStrippedSegmentCode(symbolName: string): string {
  return `export const ${symbolName} = null;`;
}
