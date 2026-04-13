/**
 * Core extraction engine for the Qwik optimizer.
 *
 * Walks an AST to find marker calls ($-suffixed functions), extracts segment
 * info (body text, positions, metadata), and returns an array of ExtractionResult
 * objects. Each result contains everything needed to generate a segment module
 * and rewrite the parent module.
 */
import { type ImportInfo } from './marker-detection.js';
export interface ExtractionResult {
    symbolName: string;
    displayName: string;
    hash: string;
    canonicalFilename: string;
    callStart: number;
    callEnd: number;
    calleeStart: number;
    calleeEnd: number;
    argStart: number;
    argEnd: number;
    bodyText: string;
    calleeName: string;
    isBare: boolean;
    isSync: boolean;
    qrlCallee: string;
    importSource: string;
    ctxKind: 'function' | 'eventHandler' | 'jSXProp';
    ctxName: string;
    origin: string;
    extension: string;
    loc: [number, number];
    parent: string | null;
    captures: boolean;
    captureNames: string[];
    paramNames: string[];
    segmentImports: ImportInfo[];
    isInlinedQrl: boolean;
    explicitCaptures: string | null;
    inlinedQrlNameArg: string | null;
    isComponentEvent: boolean;
    propsFieldCaptures?: Map<string, string>;
    constLiterals?: Map<string, string>;
}
/**
 * Extract all segments from a Qwik source file.
 *
 * Parses the source, walks the AST to find marker calls, and returns
 * an ExtractionResult for each one containing all info needed for
 * segment codegen and parent module rewriting.
 */
export declare function extractSegments(source: string, relPath: string, scope?: string, transpileJsx?: boolean, preParsedProgram?: any): ExtractionResult[];
//# sourceMappingURL=extract.d.ts.map