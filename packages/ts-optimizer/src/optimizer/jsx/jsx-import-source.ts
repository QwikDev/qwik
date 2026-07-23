/**
 * Detect an `@jsxImportSource` pragma naming a non-Qwik runtime (`react`, `preact`, …), meaning the
 * file's JSX should be compiled by that runtime, not Qwik. Pragmas naming Qwik's own runtime
 * (`@qwik.dev/core`, `@builder.io/qwik`) are NOT foreign.
 */
export function detectForeignJsxRuntime(source: string): {
  hasForeignJsxRuntime: boolean;
  pragmaText: string | null;
} {
  const m = /\/\*\s*@jsxImportSource\s+(?!@qwik|@builder\.io\/qwik)\S+\s*\*\//.exec(source);
  if (!m) return { hasForeignJsxRuntime: false, pragmaText: null };
  return { hasForeignJsxRuntime: true, pragmaText: m[0] };
}
