/**
 * Inline/hoist entry strategy QRL builders.
 *
 * When the entry strategy is 'inline' or 'hoist', segments are not emitted
 * as separate files. Instead, QRL declarations use _noopQrl() and segment
 * bodies are attached via .s() calls in the parent module.
 *
 * Stripped segments (via stripCtxName) use sentinel counter naming to avoid
 * conflicts with real symbol names.
 *
 * Implements: ENT-02
 */
/**
 * Compute the sentinel counter for a stripped segment's QRL variable name.
 *
 * Formula: 0xFFFF0000 + index * 2
 * Produces: 4294901760, 4294901762, 4294901764, ...
 *
 * This range cannot conflict with real QRL names.
 */
export declare function getSentinelCounter(index: number): number;
/**
 * Build a _noopQrl const declaration for inline/hoist strategy.
 *
 * Format (verified from example_inlined_entry_strategy snapshot):
 * ```
 * const q_{symbolName} = /*#__PURE__* / _noopQrl("{symbolName}");
 * ```
 */
export declare function buildNoopQrlDeclaration(symbolName: string): string;
/**
 * Build a _noopQrlDEV const declaration for inline/hoist + dev mode.
 *
 * Format (verified from example_dev_mode_inlined snapshot):
 * ```
 * const q_{symbolName} = /*#__PURE__* / _noopQrlDEV("{symbolName}", {
 *     file: "{file}",
 *     lo: {lo},
 *     hi: {hi},
 *     displayName: "{displayName}"
 * });
 * ```
 */
export declare function buildNoopQrlDevDeclaration(symbolName: string, devMeta: {
    file: string;
    lo: number;
    hi: number;
    displayName: string;
}): string;
/**
 * Build a sentinel-named _noopQrl declaration for a stripped segment.
 *
 * Format (verified from example_strip_server_code snapshot):
 * ```
 * const q_qrl_{counter} = /*#__PURE__* / _noopQrl("{symbolName}");
 * ```
 */
export declare function buildStrippedNoopQrl(symbolName: string, strippedIndex: number): string;
/**
 * Build a sentinel-named _noopQrlDEV declaration for a stripped segment in dev mode.
 *
 * Format (verified from example_noop_dev_mode snapshot):
 * ```
 * const q_qrl_{counter} = /*#__PURE__* / _noopQrlDEV("{symbolName}", {
 *     file: "{file}",
 *     lo: {lo},
 *     hi: {hi},
 *     displayName: "{displayName}"
 * });
 * ```
 */
export declare function buildStrippedNoopQrlDev(symbolName: string, strippedIndex: number, devMeta: {
    file: string;
    lo: number;
    hi: number;
    displayName: string;
}): string;
/**
 * Build a .s() call that attaches a segment body to its QRL variable.
 *
 * Format (verified from example_inlined_entry_strategy snapshot):
 * ```
 * {varName}.s({bodyText});
 * ```
 */
export declare function buildSCall(varName: string, bodyText: string): string;
/**
 * Build a const function declaration for hoist strategy.
 *
 * Format (verified from example_mutable_children snapshot):
 * ```
 * const {symbolName} = {bodyText};
 * ```
 */
export declare function buildHoistConstDecl(symbolName: string, bodyText: string): string;
/**
 * Build a simple .s() call for hoist strategy (variable name only, no body).
 *
 * Format (verified from example_mutable_children snapshot):
 * ```
 * {qrlVarName}.s({symbolName});
 * ```
 */
export declare function buildHoistSCall(qrlVarName: string, symbolName: string): string;
//# sourceMappingURL=inline-strategy.d.ts.map