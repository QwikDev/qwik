/**
 * Parent module rewriting engine for the Qwik optimizer.
 *
 * Surgically edits source text via magic-string, replacing $() calls with QRL
 * references, managing imports, and assembling the final parent module.
 *
 * Output structure:
 *   [optimizer-added imports]
 *   [original non-marker imports]
 *   //
 *   [QRL const declarations]
 *   //
 *   [rewritten module body]
 *   [_auto_ exports if any]
 */
import type { ExtractionResult } from './extract.js';
import type { ImportInfo } from './marker-detection.js';
import type { MigrationDecision, ModuleLevelDecl } from './variable-migration.js';
import type { EmitMode } from './types.js';
export interface InlineStrategyOptions {
    /** Whether to use inline/hoist strategy (_noopQrl + .s()) */
    inline: boolean;
    /** Entry strategy type: 'inline' puts body in .s(), 'hoist' extracts body as const */
    entryType?: 'inline' | 'hoist';
    /** Strip context names (server/client strip) */
    stripCtxName?: string[];
    /** Strip event handlers */
    stripEventHandlers?: boolean;
    /** Register context names (server-tagged extractions get _regSymbol wrapping) */
    regCtxName?: string[];
}
export interface ParentRewriteResult {
    /** Rewritten parent module source code. */
    code: string;
    /** All extractions (possibly with nested parent refs). */
    extractions: ExtractionResult[];
    /** Final JSX key counter value after parent module transform (for segment continuation). */
    jsxKeyCounterValue?: number;
}
/**
 * Parse a parent extraction body and find const declarations with literal values
 * for the given capture names. Returns a map of name -> literal source text.
 */
export declare function resolveConstLiterals(parentBody: string, captureNames: string[]): Map<string, string>;
/**
 * Replace captured identifier references in a body text with their inlined
 * literal values. Uses AST-based replacement to avoid replacing property names.
 */
export declare function inlineConstCaptures(body: string, constValues: Map<string, string>): string;
/**
 * Inline `const X = <literal>` within a body and remove dead declarations.
 * Iterates until no more propagation is possible (for cascading).
 */
export declare function propagateConstLiteralsInBody(body: string): string;
/**
 * Rewrite ({field1, field2}) => ... to (_rawProps) => ... _rawProps.field1 ...
 * so signal analysis detects store field accesses.
 */
export interface RawPropsTransformResult {
    /** The transformed body text */
    body: string;
    /** Whether any transformation was applied */
    transformed: boolean;
    /** The destructured field local names that were replaced with _rawProps.field */
    destructuredFieldLocals: string[];
}
export declare function applyRawPropsTransformDetailed(body: string): RawPropsTransformResult;
/**
 * Extract a map from local binding name to property key name from a destructured first parameter.
 * Given `({foo, "bind:value": bindValue}) => ...`, returns Map { "foo" -> "foo", "bindValue" -> "bind:value" }.
 */
export declare function extractDestructuredFieldMap(body: string): Map<string, string>;
/**
 * After _rawProps transform, consolidate .w([...]) arrays:
 * Replace any _rawProps.xxx entries with a single _rawProps, deduped.
 *
 * e.g., `.w([arg0, _rawProps.foo, _rawProps.bar])` -> `.w([arg0, _rawProps])`
 *
 * Returns the consolidated body text.
 */
export declare function consolidateRawPropsInWCalls(body: string): string;
export declare function applyRawPropsTransform(body: string): string;
export interface JsxRewriteOptions {
    enableJsx: boolean;
    importedNames: Set<string>;
    enableSignals?: boolean;
}
/**
 * Rewrite a parent module source using magic-string.
 *
 * Pipeline:
 *   1. processImports       - remove/filter import declarations, track survivors
 *   2. applyModeTransforms  - strip exports, replace constants
 *   3. resolveNesting       - determine parent-child extraction relationships
 *   4. rewriteCallSites     - replace $() calls with QRL references
 *   5. addCaptureWrapping   - append .w([captures]) to QRL references
 *   6. runJsxTransform      - convert JSX to _jsxSorted calls
 *   7. collectNeededImports - gather all optimizer-added imports
 *   8. buildQrlDeclarations - generate QRL const declarations
 *   9. buildInlineSCalls    - generate .s() calls for inline/hoist strategy
 *  10. filterUnusedImports  - remove specifiers only used in segments
 *  11. assembleOutput       - prepend preamble, insert .s() calls, strip TS
 */
export declare function rewriteParentModule(source: string, relPath: string, extractions: ExtractionResult[], originalImports: Map<string, ImportInfo>, migrationDecisions?: MigrationDecision[], moduleLevelDecls?: ModuleLevelDecl[], jsxOptions?: JsxRewriteOptions, mode?: EmitMode, devFilePath?: string, inlineOptions?: InlineStrategyOptions, stripExports?: string[], isServer?: boolean, explicitExtensions?: boolean, transpileTs?: boolean, minify?: string, outputExtension?: string, existingProgram?: any): ParentRewriteResult;
//# sourceMappingURL=rewrite-parent.d.ts.map