/**
 * Capture analysis module for the Qwik optimizer.
 *
 * Detects variables that cross $() boundaries -- variables referenced
 * inside a $() closure but declared in an enclosing scope. These become
 * the `captureNames` array in segment metadata, used for _captures injection.
 */
export interface CaptureAnalysisResult {
    captureNames: string[];
    captures: boolean;
    paramNames: string[];
}
/**
 * Analyze a $() closure node to determine which variables cross the
 * serialization boundary. Excludes globals and import bindings.
 */
export declare function analyzeCaptures(closureNode: any, parentScopeIdentifiers: Set<string>, importedNames: Set<string>): CaptureAnalysisResult;
/** Extract all binding names from function parameter AST nodes. */
export declare function collectParamNames(params: any[]): string[];
/**
 * Collect all identifiers declared in a container scope (function body or program).
 */
export declare function collectScopeIdentifiers(containerNode: any, _source: string, _relPath: string): Set<string>;
//# sourceMappingURL=capture-analysis.d.ts.map