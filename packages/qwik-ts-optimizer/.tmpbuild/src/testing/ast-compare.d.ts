export interface AstCompareResult {
    match: boolean;
    expectedParseError: string | null;
    actualParseError: string | null;
}
/**
 * Compare two code strings for semantic AST equivalence.
 * Uses oxc-parser to parse both strings, strips position/range data,
 * and performs deep structural comparison.
 *
 * @param expected - The expected code string (from snapshot)
 * @param actual - The actual code string (from optimizer output)
 * @param filename - Filename hint for parser (determines language: .tsx, .ts, .js)
 * @returns AstCompareResult with match status and any parse errors
 */
export declare function compareAst(expected: string, actual: string, filename: string): AstCompareResult;
//# sourceMappingURL=ast-compare.d.ts.map