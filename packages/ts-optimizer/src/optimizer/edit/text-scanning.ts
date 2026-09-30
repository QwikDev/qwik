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
      if (ch === '{') {
        templateDepth++;
      } else if (ch === '}') {
        templateDepth--;
      }
      continue;
    }
    if (inTemplate && ch === '$' && text[i + 1] === '{') {
      templateDepth = 1;
      i++;
      continue;
    }
    if (ch === "'" && !inDouble && !inTemplate) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle && !inTemplate) {
      inDouble = !inDouble;
    } else if (ch === '`' && !inSingle && !inDouble) {
      inTemplate = !inTemplate;
    }
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
  while (j > 0 && /\s/.test(source[j - 1]!)) {
    j--;
  }
  const match = PURE_ANNOTATION_AT_END.exec(source.slice(0, j));
  return match ? match.index : callStart;
}

/**
 * Skip the string or template literal opening at `i`; returns the index of the closing quote.
 * Template `${}` interpolations are skipped by brace depth, with string literals inside the
 * interpolation (including nested templates) skipped recursively so their braces don't count.
 */
export function skipStringLiteralForward(text: string, i: number): number {
  const quote = text[i];
  i++;
  while (i < text.length && text[i] !== quote) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (quote === '`' && text[i] === '$' && text[i + 1] === '{') {
      i += 2;
      let depth = 1;
      while (i < text.length && depth > 0) {
        const ch = text[i];
        if (ch === '"' || ch === "'" || ch === '`') {
          i = skipStringLiteralForward(text, i) + 1;
          continue;
        }
        if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return i;
}

/**
 * Length-preserving copy with string/template contents and comments blanked to spaces (newlines
 * kept), so position-based scanners see only code. The quote characters themselves are kept as
 * anchors. Template `${}` interpolation contents blank too — declarations inside them go unseen,
 * which scanners must treat as "not found", never as license to match raw text.
 */
const nonNewline = /[^\n]/g;

/** Same length, every character but a newline replaced by a space. */
function spacesLike(segment: string): string {
  const firstNewline = segment.indexOf('\n');
  return firstNewline === -1 ? ' '.repeat(segment.length) : segment.replace(nonNewline, ' ');
}

export function blankNonCode(text: string): string {
  // Copy the code spans verbatim and blank only what lies between them. Building this per character
  // costs an array of single-character strings per call, and this runs on nearly every module.
  let out = '';
  let copied = 0;
  const blank = (from: number, to: number): void => {
    const stop = to < text.length ? to : text.length;
    if (stop <= from) {
      return;
    }
    out += text.slice(copied, from) + spacesLike(text.slice(from, stop));
    copied = stop;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const close = skipStringLiteralForward(text, i);
      blank(i + 1, close);
      i = close;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      blank(i, stop);
      i = stop - 1;
    } else if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      const stop = nl < 0 ? text.length : nl;
      blank(i, stop);
      i = stop - 1;
    }
  }
  return copied === 0 ? text : out + text.slice(copied);
}

/** Scan from `start` (just after the open paren) to the index one past the matching close paren. */
export function scanMatchingParenForward(text: string, start: number): number {
  let depth = 1;
  let j = start;
  while (j < text.length && depth > 0) {
    const ch = text[j];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      j = skipStringLiteralForward(text, j);
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
    if (text[i] === ')') {
      depth++;
    } else if (text[i] === '(') {
      depth--;
    }
    i--;
  }
  return i + 1;
}
