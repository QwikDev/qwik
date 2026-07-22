/**
 * Display-name and symbol-name construction for Qwik segments.
 */

import { qwikHash } from './siphash.js';
import { getBasename } from '../paths.js';
import {
  type DisplayName,
  type SymbolName,
  mkDisplayName,
  mkSymbolName,
} from '../optimizer/types/brands.js';

/**
 * Escape a string to contain only alphanumeric characters and underscores:
 * non-alphanumerics become underscores, leading/trailing ones are dropped, and
 * consecutive non-alphanumerics collapse to a single underscore.
 */
export function escapeSymbol(str: string): string {
  let result = '';
  let pendingUnderscore = false;
  let hasContent = false;

  for (const ch of str) {
    const isAlnum =
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= 'a' && ch <= 'z') ||
      (ch >= '0' && ch <= '9');
    if (isAlnum) {
      if (pendingUnderscore && hasContent) {
        result += '_';
      }
      result += ch;
      hasContent = true;
      pendingUnderscore = false;
    } else {
      if (hasContent) {
        pendingUnderscore = true;
      }
    }
  }
  return result;
}

/**
 * Build the display name `{fileStem}_{escapedContext}` from a file stem and
 * context stack. An empty stack yields `{fileStem}_s_`; a result starting with a
 * digit gets a leading underscore.
 */
export function buildDisplayName(fileStem: string, contextStack: string[]): DisplayName {
  const joined = contextStack.length === 0 ? 's_' : contextStack.join('_');

  let escaped = escapeSymbol(joined);

  if (escaped.length > 0 && escaped[0] >= '0' && escaped[0] <= '9') {
    escaped = '_' + escaped;
  }

  if (contextStack.length === 0) {
    return mkDisplayName(fileStem + '_s_');
  }

  return mkDisplayName(fileStem + '_' + escaped);
}

/**
 * Build the symbol name `{contextPortion}_{hash}`, where `contextPortion` is the
 * displayName with the `{fileStem}_` prefix removed and `hash` is
 * `qwikHash(scope, relPath, contextPortion)`.
 */
export function buildSymbolName(
  displayName: DisplayName,
  scope: string | undefined,
  relPath: string
): SymbolName {
  const basename = getBasename(relPath);
  const prefix = basename + '_';
  const contextPortion = displayName.startsWith(prefix)
    ? displayName.slice(prefix.length)
    : displayName;

  const hash = qwikHash(scope, relPath, contextPortion);
  return mkSymbolName(contextPortion + '_' + hash);
}
