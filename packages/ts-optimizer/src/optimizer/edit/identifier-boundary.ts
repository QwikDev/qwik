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
 * contents are data, never code to rewrite.
 */
export function replaceOutsideStrings(text: string, pattern: RegExp, replacement: string): string {
  let out = '';
  let codeStart = 0;
  const flush = (end: number): void => {
    if (end > codeStart) out += text.slice(codeStart, end).replace(pattern, replacement);
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
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
