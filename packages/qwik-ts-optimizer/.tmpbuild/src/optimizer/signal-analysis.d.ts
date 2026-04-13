/**
 * Signal analysis for the Qwik optimizer.
 *
 * Detects signal/store expressions in JSX props and generates appropriate
 * wrapping (_wrapProp) or hoisted function signal (_fnSignal) representations.
 */
export type SignalExprResult = {
    type: 'none';
} | {
    type: 'wrapProp';
    code: string;
    isStoreField?: boolean;
} | {
    type: 'fnSignal';
    deps: string[];
    hoistedFn: string;
    hoistedStr: string;
    isObjectExpr?: boolean;
};
/** Detect `x.value` MemberExpression pattern (signal value access). */
export declare function isSignalValueAccess(node: any): boolean;
/**
 * Detect `props.field` or `store.field` where the object is a local variable.
 * Only matches single-level member access. Excludes `.value` (that's signal).
 */
export declare function isStoreFieldAccess(node: any, importedNames: Set<string>, localNames?: Set<string>): boolean;
/**
 * Analyze a JSX prop expression to determine if it should be wrapped
 * with _wrapProp, converted to _fnSignal, or left as-is.
 */
export declare function analyzeSignalExpression(exprNode: any, source: string, importedNames: Set<string>, localNames?: Set<string>): SignalExprResult;
/** Manages hoisted signal functions (_hf0, _hf1, etc.) for a module. */
export declare class SignalHoister {
    counter: number;
    hoistedFunctions: Array<{
        name: string;
        fn: string;
        str: string;
        sourcePos: number;
    }>;
    private dedupMap;
    /**
     * Add a hoisted function, returns the _hfN name.
     * Deduplicates: identical function bodies reuse their existing name.
     */
    hoist(fn: string, str: string, sourcePos?: number): string;
    /** Get all hoisted declarations as source text lines. */
    getDeclarations(): string[];
    /**
     * Build a renaming map that renumbers _hf variables by source position order.
     * SWC processes elements top-down (props before children) but our walk is
     * bottom-up (leave callback). This renumbers from walk order to source order.
     * Returns null if already in order.
     */
    buildRenameMap(): Map<string, string> | null;
}
//# sourceMappingURL=signal-analysis.d.ts.map