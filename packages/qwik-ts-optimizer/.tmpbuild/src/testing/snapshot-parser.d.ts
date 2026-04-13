/**
 * Snapshot parser for Qwik optimizer .snap files (Rust insta format).
 *
 * Parses YAML frontmatter, optional INPUT section, segment blocks with
 * metadata, parent module blocks, and diagnostics.
 */
export interface SegmentMetadata {
    origin: string;
    name: string;
    entry: string | null;
    displayName: string;
    hash: string;
    canonicalFilename: string;
    path: string;
    extension: string;
    parent: string | null;
    ctxKind: string;
    ctxName: string;
    captures: boolean;
    loc: [number, number];
    paramNames?: string[];
    captureNames?: string[];
}
export interface Diagnostic {
    category: string;
    code: string;
    file: string;
    message: string;
    highlights: Array<{
        lo: number;
        hi: number;
        startLine: number;
        startCol: number;
        endLine: number;
        endCol: number;
    }> | null;
    suggestions: null;
    scope: string;
}
export interface SegmentBlock {
    filename: string;
    isEntryPoint: boolean;
    code: string;
    sourceMap: string | null;
    metadata: SegmentMetadata | null;
}
export interface ParentModule {
    filename: string;
    code: string;
    sourceMap: string | null;
}
export interface ParsedSnapshot {
    frontmatter: {
        source: string;
        assertionLine: number;
        expression: string;
    };
    input: string | null;
    segments: SegmentBlock[];
    parentModules: ParentModule[];
    diagnostics: Diagnostic[];
}
/**
 * Parse a .snap file content string into structured data.
 */
export declare function parseSnapshot(content: string): ParsedSnapshot;
//# sourceMappingURL=snapshot-parser.d.ts.map