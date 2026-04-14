/**
 * Cache for parsed extraction body ASTs.
 *
 * Multiple transform functions parse the same body text independently
 * (const-propagation, raw-props, inline-body). This cache ensures
 * each unique body text is parsed exactly once per transform pipeline run.
 */
import { parseSync } from 'oxc-parser';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../ast-types.js';
import type { AstParseResult } from '../../ast-types.js';

const WRAPPER_PREFIX = 'const __b__ = ';

const cache = new Map<string, AstParseResult>();

/** Get (or create) a parsed AST for the given body text. */
export function getBodyAst(bodyText: string): { parseResult: AstParseResult; offset: number } {
  let result = cache.get(bodyText);
  if (!result) {
    const wrapped = WRAPPER_PREFIX + bodyText;
    result = parseSync('__body__.tsx', wrapped, RAW_TRANSFER_PARSER_OPTIONS);
    cache.set(bodyText, result);
  }
  return { parseResult: result, offset: WRAPPER_PREFIX.length };
}

/** Clear the cache. Call once per transformModule() invocation. */
export function clearBodyAstCache(): void {
  cache.clear();
}
