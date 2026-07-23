/**
 * Character-level scanning for cases where the AST is unavailable or stale: post-transform text,
 * iterative rewrites, and pre-parse repair. Each helper skips string literals to avoid matching
 * inside quoted content.
 */

export function isInsideString(text: string, offset: number): boolean {
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let templateDepth = 0;
  for (let i = 0; i < offset; i++) {
    const ch = text[i];
    if (ch === '\\' && (inSingle || inDouble || (inTemplate && templateDepth === 0))) {
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

const PURE_ANNOTATION_AT_END = /\/\*\s*[#@]__PURE__\s*\*\/$/;

/**
 * Given the start of a call about to become a bare identifier, return the offset to overwrite from
 * so a preceding PURE annotation is consumed with it. Left in front of a bare identifier the
 * annotation is meaningless, and once a downstream transform reflows it onto its own line Rolldown
 * aborts with INVALID_ANNOTATION. Whitespace before the annotation is preserved.
 */
export function pureAwareOverwriteStart(source: string, callStart: number): number {
  let j = callStart;
  while (j > 0 && /\s/.test(source[j - 1]!)) j--;
  const match = PURE_ANNOTATION_AT_END.exec(source.slice(0, j));
  return match ? match.index : callStart;
}

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

/** Scan from `start` (just after the open paren) to the index one past the matching close paren. */
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
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text[j] === quote) break;
        j++;
      }
    }
    j++;
  }
  return j;
}

/** Scan backward from `start` to the index of the matching open paren. */
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
 * Find the end of an expression at `start`, respecting nested parens, braces, JSX angle brackets,
 * and string literals. Terminates at a depth-0 newline, semicolon, or comma, or at an unmatched
 * closing delimiter.
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
