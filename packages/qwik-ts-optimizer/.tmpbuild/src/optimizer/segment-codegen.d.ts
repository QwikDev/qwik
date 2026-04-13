/**
 * Segment module code generation.
 *
 * Generates the source code for extracted segment modules. Each segment
 * module contains only the imports it references plus the exported segment body.
 */
import type { ExtractionResult } from './extract.js';
export interface SegmentCaptureInfo {
    /** Variables received via _captures (scope-level captures). */
    captureNames: string[];
    /** _auto_VARNAME imports from parent module (module-level migration). */
    autoImports: Array<{
        varName: string;
        parentModulePath: string;
    }>;
    /** Declarations physically moved into the segment, with their import dependencies. */
    movedDeclarations: Array<{
        text: string;
        importDeps: Array<{
            localName: string;
            importedName: string;
            source: string;
        }>;
    }>;
    /** If true, skip _captures unpacking injection (body already has _captures refs, e.g. inlinedQrl). */
    skipCaptureInjection?: boolean;
    /**
     * Map from original prop field local name to prop key name.
     * When set, these captures have been consolidated into _rawProps.
     * The segment body should replace bare references to these fields with _rawProps.key.
     */
    propsFieldCaptures?: Map<string, string>;
    /**
     * Map from captured variable name to its literal source text.
     * When set, these const literal captures are inlined into the segment body
     * and removed from captureNames (matching SWC behavior).
     */
    constLiterals?: Map<string, string>;
}
/**
 * Additional import context from transform.ts for post-transform import re-collection.
 * After body transforms (JSX, nested calls, sync$), the segment body may reference
 * identifiers not in the original segmentImports.
 */
export interface SegmentImportContext {
    moduleImports: Array<{
        localName: string;
        importedName: string;
        source: string;
        importAttributes?: Record<string, string>;
    }>;
    sameFileExports: Set<string>;
    defaultExportedNames?: Set<string>;
    /** Map from local variable name to its exported name when they differ */
    renamedExports?: Map<string, string>;
    parentModulePath: string;
    migrationDecisions: Array<{
        varName: string;
        action: string;
        isExported?: boolean;
    }>;
}
export interface SegmentJsxOptions {
    enableJsx: boolean;
    importedNames: Set<string>;
    paramNames?: Set<string>;
    relPath?: string;
    keyCounterStart?: number;
    devOptions?: {
        relPath: string;
    };
}
export interface NestedCallSiteInfo {
    qrlVarName: string;
    callStart: number;
    callEnd: number;
    isJsxAttr: boolean;
    attrStart?: number;
    attrEnd?: number;
    transformedPropName?: string;
    hoistedSymbolName?: string;
    hoistedCaptureNames?: string[];
    loopLocalParamNames?: string[];
    elementQpParams?: string[];
    qrlCallee?: string;
    captureNames?: string[];
    importSource?: string;
}
/**
 * Inject _captures unpacking into a function body text.
 * For expression bodies (`=> expr`), converts to `=> { return expr; }` first.
 */
export declare function injectCapturesUnpacking(bodyText: string, captureNames: string[]): string;
/**
 * Generate the segment module source code for an extracted segment.
 *
 * Output layout:
 * 1. Import lines (only imports the segment references)
 * 2. "//" separator
 * 3. Hoisted signal declarations (_hf) if any
 * 4. Nested QRL declarations (const q_*) if any, with "//" separator
 * 5. `export const {symbolName} = {bodyText};`
 */
export declare function generateSegmentCode(extraction: ExtractionResult, nestedQrlDecls?: string[], captureInfo?: SegmentCaptureInfo, jsxOptions?: SegmentJsxOptions, nestedCallSites?: NestedCallSiteInfo[], importContext?: SegmentImportContext, enumValueMap?: Map<string, Map<string, string>>): {
    code: string;
    keyCounterValue?: number;
};
/**
 * Remove `const X = literal;` declarations from a function body when X is
 * no longer referenced anywhere else in the body. Only removes declarations
 * with simple literal initializers to ensure no side effects are dropped.
 */
export declare function removeDeadConstLiterals(bodyText: string): string;
/**
 * Rewrite a function's parameter list to use the given paramNames.
 * Handles both arrow functions and function expressions.
 */
export declare function rewriteFunctionSignature(bodyText: string, paramNames: string[]): string;
//# sourceMappingURL=segment-codegen.d.ts.map