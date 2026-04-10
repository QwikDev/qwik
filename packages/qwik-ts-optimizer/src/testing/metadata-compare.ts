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
export function compareMetadata(
  expected: SegmentMetadata,
  actual: SegmentMetadata,
): MetadataCompareResult {
  const mismatches: MetadataFieldMismatch[] = [];

  // String/boolean/null fields - exact match
  const simpleFields: (keyof SegmentMetadata)[] = [
    'origin',
    'name',
    'entry',
    'displayName',
    'hash',
    'canonicalFilename',
    'path',
    'extension',
    'parent',
    'ctxKind',
    'ctxName',
    'captures',
  ];

  for (const field of simpleFields) {
    if (expected[field] !== actual[field]) {
      mismatches.push({ field, expected: expected[field], actual: actual[field] });
    }
  }

  // loc: [number, number] - compare elements
  if (expected.loc[0] !== actual.loc[0] || expected.loc[1] !== actual.loc[1]) {
    mismatches.push({ field: 'loc', expected: expected.loc, actual: actual.loc });
  }

  // Optional array fields - compare as JSON strings (order matters for paramNames)
  const arrayFields: (keyof SegmentMetadata)[] = ['paramNames', 'captureNames'];
  for (const field of arrayFields) {
    const exp = expected[field];
    const act = actual[field];
    if (JSON.stringify(exp) !== JSON.stringify(act)) {
      mismatches.push({ field, expected: exp, actual: act });
    }
  }

  return { match: mismatches.length === 0, mismatches };
}
