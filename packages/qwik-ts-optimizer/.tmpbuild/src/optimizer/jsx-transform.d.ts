/**
 * JSX element transformation module for the Qwik optimizer.
 *
 * Converts JSX syntax to _jsxSorted/_jsxSplit function calls with
 * correct prop classification (varProps/constProps), flags computation,
 * key generation, spread handling, and fragment support.
 */
import type MagicString from 'magic-string';
import { SignalHoister } from './signal-analysis.js';
import { type LoopContext } from './loop-hoisting.js';
export interface JsxTransformResult {
    tag: string;
    varProps: string | null;
    constProps: string | null;
    children: string | null;
    flags: number;
    key: string | null;
    callString: string;
    neededImports: Set<string>;
}
export interface JsxTransformOutput {
    neededImports: Set<string>;
    needsFragment: boolean;
    hoistedDeclarations: string[];
    keyCounterValue: number;
}
/**
 * Collect names of const-bound identifiers with "static" initializers.
 * These are treated as immutable references for prop classification.
 */
export declare function collectConstIdents(program: any): Set<string>;
/**
 * Collect all locally declared identifier names from an AST program.
 * Used to distinguish known locals from unknown globals for signal analysis.
 */
export declare function collectAllLocalNames(program: any): Set<string>;
/**
 * Determine if an expression is immutable (const) or mutable (var).
 * Mirrors SWC's `is_const_expr`.
 */
export declare function classifyProp(exprNode: any, importedNames: Set<string>, constIdents?: Set<string>): 'const' | 'var';
/**
 * Compute the flags bitmask for a JSX element.
 *
 * Bit 0 (1): static_listeners -- all event handler props are const
 * Bit 1 (2): static_subtree -- children are static or none
 * Bit 2 (4): moved_captures -- loop context (q:p/q:ps)
 */
export declare function computeFlags(hasVarProps: boolean, childrenType: 'none' | 'static' | 'dynamic', inLoop?: boolean, hasVarEventHandler?: boolean): number;
/**
 * Per-module counter for generating deterministic JSX element keys.
 * Keys follow the pattern "{prefix}_{N}" where prefix is derived from
 * the file path hash.
 */
export declare class JsxKeyCounter {
    private count;
    private prefix;
    constructor(startAt?: number, prefix?: string);
    next(): string;
    current(): number;
    reset(): void;
}
export declare function isHtmlElement(tagName: string): boolean;
export declare function isTextOnlyElement(tagName: string): boolean;
/**
 * Extract tag representation from a JSX opening element name node.
 *
 * - JSXIdentifier with lowercase -> `"div"` (string literal)
 * - JSXIdentifier with uppercase -> `Div` (identifier)
 * - JSXMemberExpression -> `Foo.Bar`
 * - JSXNamespacedName -> `"ns:name"`
 */
export declare function processJsxTag(nameNode: any): string;
/**
 * Transform a single JSX element node to a _jsxSorted/_jsxSplit/_createElement call.
 */
export declare function transformJsxElement(node: any, source: string, s: MagicString, importedNames: Set<string>, keyCounter: JsxKeyCounter, passiveEvents?: Set<string>, signalHoister?: SignalHoister, loopCtx?: LoopContext | null, isSoleChild?: boolean, enableChildSignals?: boolean, qpOverrides?: Map<number, string[]>, qrlsWithCaptures?: Set<string>, paramNames?: Set<string>, constIdents?: Set<string>, allDeclaredNames?: Set<string>): JsxTransformResult | null;
export declare function transformJsxFragment(node: any, source: string, s: MagicString, importedNames: Set<string>, keyCounter: JsxKeyCounter, _isSoleChild?: boolean, constIdents?: Set<string>, signalHoister?: SignalHoister, allDeclaredNames?: Set<string>): JsxTransformResult | null;
/**
 * Walk the AST bottom-up and transform all JSX nodes.
 * Uses leave callback to ensure inner JSX is transformed before outer JSX.
 */
export declare function transformAllJsx(source: string, s: MagicString, program: any, importedNames: Set<string>, skipRanges?: Array<{
    start: number;
    end: number;
}>, devOptions?: {
    relPath: string;
}, keyCounterStart?: number, enableSignals?: boolean, qpOverrides?: Map<number, string[]>, qrlsWithCaptures?: Set<string>, paramNames?: Set<string>, relPath?: string, sharedSignalHoister?: SignalHoister, constIdents?: Set<string>): JsxTransformOutput;
//# sourceMappingURL=jsx-transform.d.ts.map