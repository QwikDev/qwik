/**
 * Yield the module's leading comments — everything before the first token. Anything later is not a
 * pragma site, so scanning stops there rather than searching the whole file for comment-shaped
 * text.
 */
function* leadingComments(source: string): Generator<{ text: string }> {
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2);
      const end = close < 0 ? source.length : close + 2;
      yield { text: source.slice(i, end) };
      i = end;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i);
      const end = nl < 0 ? source.length : nl;
      yield { text: source.slice(i, end) };
      i = end;
      continue;
    }
    return;
  }
}

const jsxImportSourcePragma = /@jsxImportSource\s+(\S+)/;

function isQwikRuntime(importSource: string): boolean {
  return importSource.startsWith('@qwik') || importSource.startsWith('@builder.io/qwik');
}

/**
 * Detect an `@jsxImportSource` pragma naming a non-Qwik runtime (`react`, `preact`, …), meaning the
 * file's JSX should be compiled by that runtime, not Qwik.
 *
 * Matches oxc, which is what actually compiles the JSX: it reads the pragma from any leading
 * comment form — `//`, `/* *\/` or `/** *\/` — and ignores one that appears after the first token.
 * Detecting a pragma oxc would ignore is as wrong as missing one it honours: we would hand the file
 * to a runtime oxc never switches to.
 */
export function detectForeignJsxRuntime(source: string): {
  hasForeignJsxRuntime: boolean;
  pragmaText: string | null;
} {
  for (const { text } of leadingComments(source)) {
    const match = text.match(jsxImportSourcePragma);
    if (match && !isQwikRuntime(match[1])) {
      return { hasForeignJsxRuntime: true, pragmaText: text };
    }
  }
  return { hasForeignJsxRuntime: false, pragmaText: null };
}
