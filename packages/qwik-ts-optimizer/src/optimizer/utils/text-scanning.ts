/**
 * Shared text-scanning utilities for character-level operations.
 *
 * These helpers exist for cases where AST-based approaches are impractical:
 * - Post-transform text where the original AST is stale
 * - Iterative text transformations where re-parsing each iteration is wasteful
 * - Pre-parse repair steps where parsing fails on the input
 *
 * Each function handles string literal skipping to avoid false matches
 * inside quoted content.
 */

/**
 * Check if a character offset falls inside a string literal (single, double,
 * or template). Handles escape sequences and template expression nesting.
 *
 * Scans from the start of `text` up to `offset`, tracking quote state.
 */
export function isInsideString(text: string, offset: number): boolean {
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let templateDepth = 0;
  for (let i = 0; i < offset; i++) {
    const ch = text[i];
    if (
      ch === '\\' &&
      (inSingle || inDouble || (inTemplate && templateDepth === 0))
    ) {
      i++;
      continue;
    }
    if (inTemplate && templateDepth > 0) {
      if (ch === '{') templateDepth++;
      else if (ch === '}') templateDepth--;
      continue;
    }
    if (inTemplate && ch === '$' && text[i + 1] === '{') {
      templateDepth = 1;
      i++;
      continue;
    }
    if (ch === "'" && !inDouble && !inTemplate) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && !inTemplate) inDouble = !inDouble;
    else if (ch === '`' && !inSingle && !inDouble) inTemplate = !inTemplate;
  }
  return inSingle || inDouble || (inTemplate && templateDepth === 0);
}

/**
 * Find the matching close brace `}` for an open brace at `openPos`.
 * Skips string literals. Returns the index of `}`, or -1 if unmatched.
 */
export function findMatchingBrace(text: string, openPos: number): number {
  let depth = 1;
  let inString: string | null = null;
  let i = openPos + 1;

  while (i < text.length && depth > 0) {
    const ch = text[i];

    if (inString) {
      if (ch === inString && text[i - 1] !== '\\') {
        inString = null;
      }
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }

    if (ch === '{') depth++;
    else if (ch === '}') depth--;

    if (depth === 0) return i;
    i++;
  }
  return -1;
}

/**
 * Scan forward from `start` (the position AFTER the opening paren) to find
 * the matching close paren, respecting nesting and string literals.
 * Returns the index one past the closing paren.
 */
export function scanMatchingParenForward(text: string, start: number): number {
  let depth = 1;
  let j = start;
  while (j < text.length && depth > 0) {
    const ch = text[j];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      j++;
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === quote) break;
        j++;
      }
    }
    j++;
  }
  return j;
}

/**
 * Scan backward from `start` to find the matching open paren.
 * Returns the index of the opening paren.
 */
export function scanMatchingParenBackward(text: string, start: number): number {
  let depth = 1;
  let i = start;
  while (i >= 0 && depth > 0) {
    if (text[i] === ')') depth++;
    else if (text[i] === '(') depth--;
    i--;
  }
  return i + 1;
}

/**
 * Find the index of the `=>` arrow in a function text.
 * Skips arrows inside strings and nested delimiters (parens, brackets, angles).
 */
export function findArrowIndex(text: string): number {
  let depth = 0;
  let inString: string | null = null;

  for (let i = 0; i < text.length - 1; i++) {
    const ch = text[i];

    if (inString) {
      if (ch === inString && text[i - 1] !== '\\') inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '<') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '>') { depth--; continue; }
    if (depth === 0 && ch === '=' && text[i + 1] === '>') return i;
  }

  return -1;
}

/**
 * Find the end of an expression starting at `start`, respecting nested
 * delimiters (parens, braces, angle brackets for JSX) and string literals.
 *
 * Terminates at newline, semicolon, or comma when at depth 0, or at
 * an unmatched closing delimiter.
 *
 * Used by dead-code elimination to find the extent of `false && <expr>`.
 */
export function findExpressionEnd(code: string, start: number): number {
  let i = start;
  let inString: string | null = null;
  let angleBraceDepth = 0;
  let parenDepth = 0;
  let curlyDepth = 0;

  while (i < code.length) {
    const ch = code[i];

    if (inString) {
      if (ch === inString && code[i - 1] !== '\\') inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }

    if (ch === '(') {
      parenDepth++;
      i++;
      continue;
    }
    if (ch === ')') {
      if (parenDepth === 0) return i;
      parenDepth--;
      i++;
      continue;
    }
    if (ch === '{') {
      curlyDepth++;
      i++;
      continue;
    }
    if (ch === '}') {
      if (curlyDepth === 0) return i;
      curlyDepth--;
      i++;
      continue;
    }
    if (ch === '<') {
      if (code[i + 1] === '/') {
        const closeEnd = code.indexOf('>', i);
        if (closeEnd >= 0 && angleBraceDepth > 0) {
          angleBraceDepth--;
          i = closeEnd + 1;
          if (angleBraceDepth === 0 && parenDepth === 0 && curlyDepth === 0) {
            return i;
          }
          continue;
        }
      }

      angleBraceDepth++;
      let j = i + 1;
      let tagCurly = 0;
      while (j < code.length) {
        if (code[j] === '{') tagCurly++;
        else if (code[j] === '}') tagCurly--;
        else if (code[j] === '>' && tagCurly === 0) {
          if (code[j - 1] === '/') {
            angleBraceDepth--;
            i = j + 1;
            if (angleBraceDepth === 0 && parenDepth === 0 && curlyDepth === 0) {
              return i;
            }
          } else {
            i = j + 1;
          }
          break;
        }
        j++;
      }
      if (j >= code.length) return code.length;
      continue;
    }

    if (angleBraceDepth === 0 && parenDepth === 0 && curlyDepth === 0) {
      if (ch === '\n' || ch === ';' || ch === ',') return i;
    }

    i++;
  }
  return i;
}
