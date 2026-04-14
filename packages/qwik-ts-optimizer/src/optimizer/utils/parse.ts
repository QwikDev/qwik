import { parseSync, type ParseResult } from 'oxc-parser';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../ast-types.js';

export function parseWithRawTransfer(
  filename: string,
  sourceText: string,
): ParseResult {
  return parseSync(filename, sourceText, RAW_TRANSFER_PARSER_OPTIONS);
}
