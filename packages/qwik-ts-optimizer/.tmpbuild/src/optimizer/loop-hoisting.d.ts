/**
 * Loop hoisting module for the Qwik optimizer.
 *
 * Detects event handlers inside loops, hoists .w([captures]) above the loop,
 * injects q:p/q:ps props for iteration variable access, and generates
 * positional parameter padding.
 */
export interface LoopContext {
    type: 'map' | 'for-i' | 'for-of' | 'for-in' | 'while' | 'do-while';
    iterVars: string[];
    loopNode: any;
    loopBodyStart: number;
    loopBodyEnd: number;
}
export interface HoistingPlan {
    hoistedDecl: string;
    hoistInsertOffset: number;
    qrlRefName: string;
    originalQrlRef: string;
}
export interface LoopHoistResult {
    hoistedDecl: string | null;
    hoistOffset: number;
    qpProp: {
        propName: string;
        propValue: string;
    } | null;
    paramNames: string[];
    flags: number;
}
/**
 * Detect if an AST node represents a loop construct.
 */
export declare function detectLoopContext(node: any, _source: string): LoopContext | null;
/**
 * Plan the hoisting of .w([captures]) above a loop.
 * Returns null if captureNames is empty (no hoisting needed).
 */
export declare function hoistEventCaptures(qrlRefName: string, originalQrlRef: string, captureNames: string[]): HoistingPlan | null;
/**
 * Walk up the ancestor chain to find the nearest enclosing loop.
 * Returns null if not inside a loop.
 */
export declare function findEnclosingLoop(node: any, ancestors: any[]): LoopContext | null;
/**
 * Generate positional parameter padding for loop variable parameters.
 * The first 2 positions are always padding: ["_", "_1"] for event and context params.
 */
export declare function generateParamPadding(loopVarNames: string[]): string[];
/**
 * Build the q:p or q:ps prop for loop iteration variables.
 *
 * Single var uses q:p; multiple vars use q:ps with alphabetical sorting.
 */
export declare function buildQpProp(loopVars: string[], preserveOrder?: boolean): {
    propName: string;
    propValue: string;
} | null;
/**
 * Analyze an event handler inside a loop to produce the full hoisting plan.
 */
export declare function analyzeLoopHandler(qrlRefName: string, originalQrlRef: string, captureNames: string[], loopVarNames: string[], loopCtx: LoopContext): LoopHoistResult;
//# sourceMappingURL=loop-hoisting.d.ts.map