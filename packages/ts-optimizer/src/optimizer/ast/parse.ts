import { parseSync, type ParseResult } from 'oxc-parser';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../ast-types.js';

/**
 * Raw transfer reserves one large ArrayBuffer per parse, which a memory-constrained machine can
 * refuse even when the plain parser fits — a Windows CI runner hit this on the SSG build. The plain
 * parser yields the same ESTree, so fall back to it and stop asking once the allocation has
 * failed.
 */
let rawTransferUnavailable = false;

export function parseWithRawTransfer(filename: string, sourceText: string): ParseResult {
  if (rawTransferUnavailable || !RAW_TRANSFER_PARSER_OPTIONS.experimentalRawTransfer) {
    return parseSync(filename, sourceText);
  }
  try {
    return parseSync(filename, sourceText, RAW_TRANSFER_PARSER_OPTIONS);
  } catch (err) {
    if (!(err instanceof RangeError)) {
      throw err;
    }
    rawTransferUnavailable = true;
    return parseSync(filename, sourceText);
  }
}
