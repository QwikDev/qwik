/**
 * Input preprocessing for parse error recovery.
 *
 * oxc-parser is stricter than SWC and returns empty ASTs for certain
 * syntax errors that SWC recovers from. This module applies targeted
 * repairs to make such inputs parseable while preserving semantics.
 *
 * Repairs are ONLY applied when parseSync returns an empty program body
 * with errors. Well-formed inputs pass through unchanged.
 */
/**
 * Attempt to repair source code that oxc-parser cannot parse.
 *
 * Returns the original source unchanged if it parses successfully or
 * no repair strategy succeeds.
 */
export declare function repairInput(source: string, filename: string): {
    source: string;
    program?: any;
};
//# sourceMappingURL=input-repair.d.ts.map