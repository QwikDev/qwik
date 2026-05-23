/**
 * Detection of `@jsxImportSource` pragma when it names a non-Qwik runtime
 * (e.g. `react`, `preact`). Such a pragma means the file's JSX should be
 * compiled by the named runtime's JSX transform, NOT by Qwik's optimizer.
 *
 * When present:
 *   - Qwik's JSX-syntax rewrite is skipped; oxc-transform's default JSX
 *     transform takes over and honors the pragma itself.
 *   - JSX `$`-suffix attribute extraction is skipped (see `extract.ts`).
 *   - Marker calls (`qwikify$`, `component$`, …) still extract — they're
 *     the Qwik↔foreign-runtime bridge.
 *
 * Pragmas that name Qwik's own runtime (`@qwik.dev/core`, `@builder.io/qwik`)
 * are NOT considered foreign — the file remains under Qwik's optimization.
 *
 * Per OSS-431 (F6 Sub-B).
 */
export function detectForeignJsxRuntime(source: string): {
  hasForeignJsxRuntime: boolean;
  pragmaText: string | null;
} {
  const m = /\/\*\s*@jsxImportSource\s+(?!@qwik|@builder\.io\/qwik)\S+\s*\*\//.exec(source);
  if (!m) return { hasForeignJsxRuntime: false, pragmaText: null };
  return { hasForeignJsxRuntime: true, pragmaText: m[0] };
}
