// Longest prefix first: `@builder.io/qwik-city` must be tried before
// `@builder.io/qwik`, or the shorter rule would match it first.
const IMPORT_REWRITES: readonly [from: string, to: string][] = [
  ['@builder.io/qwik-react', '@qwik.dev/react'],
  ['@builder.io/qwik-city', '@qwik.dev/router'],
  ['@builder.io/qwik', '@qwik.dev/core'],
];

export function rewriteImportSource(source: string): string {
  for (const [from, to] of IMPORT_REWRITES) {
    if (source === from || source.startsWith(from + '/')) {
      return to + source.slice(from.length);
    }
  }
  return source;
}
