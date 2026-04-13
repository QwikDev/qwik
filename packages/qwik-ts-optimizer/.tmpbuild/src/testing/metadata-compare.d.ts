import type { SegmentMetadata } from './snapshot-parser.js';
export interface MetadataFieldMismatch {
    field: string;
    expected: unknown;
    actual: unknown;
}
export interface MetadataCompareResult {
    match: boolean;
    mismatches: MetadataFieldMismatch[];
}
/**
 * Compare two SegmentMetadata objects field-by-field.
 * Checks all 13+ fields: origin, name, entry, displayName, hash,
 * canonicalFilename, path, extension, parent, ctxKind, ctxName,
 * captures, loc, paramNames (optional), captureNames (optional).
 */
export declare function compareMetadata(expected: SegmentMetadata, actual: SegmentMetadata): MetadataCompareResult;
//# sourceMappingURL=metadata-compare.d.ts.map