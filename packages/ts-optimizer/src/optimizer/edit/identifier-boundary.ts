/**
 * `\\b` treats `$` as a non-word char, so `\\bfoo$\\b` never matches a real use of a `$`-suffixed
 * identifier. These lookaround boundaries treat `$` as part of the word.
 */
const identifierPatternCache = new Map<string, RegExp>();

function escapeForRegex(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function wholeIdentifierPattern(name: string): RegExp {
  let pattern = identifierPatternCache.get(name);
  if (!pattern) {
    pattern = new RegExp(`(?<![\\w$])${escapeForRegex(name)}(?![\\w$])`);
    identifierPatternCache.set(name, pattern);
  }
  return pattern;
}

import { skipStringLiteralForward } from './text-scanning.js';

/**
 * Run a global regex replacement only on code outside string/template literals and comments — their
 * contents are data, never code to rewrite. Template `${}` interpolations ARE code and recurse.
 */
export function replaceOutsideStrings(text: string, pattern: RegExp, replacement: string): string {
  let out = '';
  let codeStart = 0;
  const flush = (end: number): void => {
    if (end > codeStart) {
      out += text.slice(codeStart, end).replace(pattern, replacement);
    }
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '`') {
      flush(i);
      const tpl = emitTemplateLiteral(text, i, pattern, replacement);
      out += tpl.text;
      i = tpl.end;
      codeStart = i + 1;
    } else if (ch === '"' || ch === "'") {
      flush(i);
      const close = skipStringLiteralForward(text, i);
      out += text.slice(i, Math.min(close + 1, text.length));
      i = close;
      codeStart = i + 1;
    } else if (ch === '/' && text[i + 1] === '*') {
      flush(i);
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      out += text.slice(i, stop);
      i = stop - 1;
      codeStart = stop;
    } else if (ch === '/' && text[i + 1] === '/') {
      flush(i);
      const nl = text.indexOf('\n', i);
      const stop = nl < 0 ? text.length : nl;
      out += text.slice(i, stop);
      i = stop - 1;
      codeStart = stop;
    }
  }
  flush(text.length);
  return out;
}

/**
 * Emit a template literal starting at `open` (the backtick): literal chunks verbatim, `${}`
 * interpolation contents rewritten through `replaceOutsideStrings`. Returns the emitted text and
 * the index of the closing backtick (or end of input when unterminated).
 */
function emitTemplateLiteral(
  text: string,
  open: number,
  pattern: RegExp,
  replacement: string
): { text: string; end: number } {
  let out = '`';
  let i = open + 1;
  while (i < text.length && text[i] !== '`') {
    if (text[i] === '\\') {
      out += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (text[i] === '$' && text[i + 1] === '{') {
      let depth = 1;
      let k = i + 2;
      while (k < text.length && depth > 0) {
        const ch = text[k];
        if (ch === '"' || ch === "'" || ch === '`') {
          k = skipStringLiteralForward(text, k) + 1;
          continue;
        }
        if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0) {
            break;
          }
        }
        k++;
      }
      out += '${' + replaceOutsideStrings(text.slice(i + 2, k), pattern, replacement);
      if (k < text.length) {
        out += '}';
      }
      i = k + 1;
      continue;
    }
    out += text[i];
    i++;
  }
  if (i < text.length) {
    out += '`';
  }
  return { text: out, end: i };
}
