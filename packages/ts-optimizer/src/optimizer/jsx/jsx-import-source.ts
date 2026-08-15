import { isInsideString } from '../edit/text-scanning.js';

/**
 * Detect an `@jsxImportSource` pragma naming a non-Qwik runtime (`react`, `preact`, …), meaning the
 * file's JSX should be compiled by that runtime, not Qwik. Pragmas naming Qwik's own runtime
 * (`@qwik.dev/core`, `@builder.io/qwik`) are NOT foreign.
 */
export function detectForeignJsxRuntime(source: string): {
  hasForeignJsxRuntime: boolean;
  pragmaText: string | null;
} {
  for (const m of source.matchAll(
    /\/\*\s*@jsxImportSource\s+(?!@qwik|@builder\.io\/qwik)\S+\s*\*\//g
  )) {
    // Pragma-shaped STRING data must not reroute the whole file's JSX.
    if (isInsideString(source, m.index)) continue;
    return { hasForeignJsxRuntime: true, pragmaText: m[0] };
  }
  return { hasForeignJsxRuntime: false, pragmaText: null };
}
