/**
 * Import source path rewriting for Qwik package migration.
 *
 * Rewrites legacy @builder.io/* imports to their @qwik.dev/* equivalents.
 * Sub-paths are preserved after the base package is replaced.
 *
 * Sorted by descending length so longer prefixes match first
 * (prevents @builder.io/qwik-city from matching the @builder.io/qwik rule).
 */
/**
 * Rewrite an import source path from legacy @builder.io/* to @qwik.dev/*.
 *
 * Exact matches and sub-path imports are rewritten.
 * Non-qwik @builder.io imports pass through unchanged.
 */
export declare function rewriteImportSource(source: string): string;
/**
 * Rewrite legacy @builder.io package names within a full file path.
 */
export declare function rewriteFilePath(filePath: string): string;
//# sourceMappingURL=rewrite-imports.d.ts.map