/**
 * Marker function detection for the Qwik optimizer.
 *
 * Identifies which CallExpression nodes in an AST should trigger segment
 * extraction: calls ending with `$` that are imported from @qwik.dev/core
 * (or @builder.io/qwik) or defined as custom inlined functions.
 */
export interface ImportInfo {
    localName: string;
    importedName: string;
    source: string;
    isQwikCore: boolean;
}
export interface CustomInlinedInfo {
    dollarName: string;
    qrlName: string;
}
/** Collect all import declarations, returning a map keyed by local binding name. */
export declare function collectImports(program: any): Map<string, ImportInfo>;
/** Scan for `export const X$ = wrap(XQrl)` custom inlined function patterns. */
export declare function collectCustomInlined(program: any): Map<string, CustomInlinedInfo>;
/** Extract callee name from a CallExpression (Identifier callees only). */
export declare function getCalleeName(callExpr: any): string | null;
/**
 * Check if a CallExpression is a marker call that should trigger extraction.
 *
 * A marker call has a callee whose *original* (imported) name ends with `$`,
 * or is in the customInlined map. Handles renamed imports like
 * `import { component$ as Component }`.
 */
export declare function isMarkerCall(callExpr: any, imports: Map<string, ImportInfo>, customInlined: Map<string, CustomInlinedInfo>): boolean;
export declare function isBare$(callExpr: any): boolean;
/** sync$ is a marker but does NOT extract a segment. */
export declare function isSyncMarker(calleeName: string): boolean;
export declare function getCtxKind(_calleeName: string, isJsxEventAttr: boolean, isJsxNonEventAttr?: boolean): 'function' | 'eventHandler' | 'jSXProp';
export declare function getCtxName(calleeName: string, isJsxEventAttr: boolean, jsxAttrName?: string): string;
//# sourceMappingURL=marker-detection.d.ts.map