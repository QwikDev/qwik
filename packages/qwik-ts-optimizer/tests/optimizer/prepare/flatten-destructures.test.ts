/**
 * Tests for `src/optimizer/prepare/flatten-destructures.ts` — the
 * `const { X } = useFooBar()` → `const fooBar = useFooBar()` rewrite
 * introduced in F8c.
 *
 * The headline regression below pins a magic-string overwrite crash
 * surfaced by `BENCH-01` against the real Qwik monorepo. The shape:
 * two flattenable decls in the same `component$` scope where the
 * second decl introduces a destructured name; the value-side
 * Identifier of that shorthand Property was getting visited as a
 * reference and overwritten on top of the already-edited pattern
 * range. Convergence snapshots didn't exercise this shape, so the
 * crash escaped to benchmarks.
 */

import { describe, it, expect } from 'vitest';
import { parseWithRawTransfer } from '../../../src/optimizer/ast/parse.js';
import { flattenDestructureUseCalls } from '../../../src/optimizer/prepare/flatten-destructures.js';

function flatten(source: string): { source: string; changed: boolean } {
  const { program } = parseWithRawTransfer('test.tsx', source);
  return flattenDestructureUseCalls(source, 'test.tsx', program);
}

describe('flattenDestructureUseCalls', () => {
  it('rewrites a single `const { X } = useFoo()` to `const foo = useFoo()` + ref access', () => {
    const source = [
      `import { component$ } from '@qwik.dev/core';`,
      `export default component$(() => {`,
      `  const { value } = useStore();`,
      `  return <div>{value}</div>;`,
      `});`,
    ].join('\n');

    const { source: out, changed } = flatten(source);
    expect(changed).toBe(true);
    expect(out).toContain('const store = useStore()');
    expect(out).toContain('store.value');
    expect(out).not.toContain('{ value }');
  });

  it('leaves the source unchanged when no flattenable decl exists', () => {
    const source = [
      `import { component$ } from '@qwik.dev/core';`,
      `export default component$(() => {`,
      `  const value = 42;`,
      `  return <div>{value}</div>;`,
      `});`,
    ].join('\n');

    const { source: out, changed } = flatten(source);
    expect(changed).toBe(false);
    expect(out).toBe(source);
  });

  it('does not flatten destructures outside a component$ body', () => {
    const source = [
      `const { value } = useStore();`,
      `export const x = value;`,
    ].join('\n');

    const { source: out, changed } = flatten(source);
    expect(changed).toBe(false);
    expect(out).toBe(source);
  });

  // ── Regression: F8c crash surfaced by BENCH-01 ─────────────────
  //
  // The bug: when the same scope holds two flattenable decls and the
  // walker visits the value-side Identifier of the SECOND decl's
  // shorthand Property, the loop could match a substitution from the
  // *second* decl (correctly) but use the *first* decl's id-range
  // for the "skip if inside pattern" check. The check then failed
  // (node is not inside first decl's id-range), and the overwrite
  // attempt hit the already-edited chunk inside the second decl's
  // pattern — `magic-string` threw:
  //
  //   Cannot split a chunk that has already been edited (45:10 – "{ url }")
  //
  // The fix hoists the "skip if inside ANY decl's pattern" check out
  // of the per-decl loop. This test pins the regression.

  it('does not crash on two flattenable decls in the same scope (BENCH-01 repro)', () => {
    const source = [
      `import { component$ } from '@qwik.dev/core';`,
      `export default component$(() => {`,
      `  const { x } = useFoo();`,
      `  const { url } = useBar();`,
      `  return <div>{x}{url}</div>;`,
      `});`,
    ].join('\n');

    // Pre-fix: this throws `Cannot split a chunk that has already
    // been edited`. Post-fix: rewrite succeeds and produces both
    // flattened bindings.
    let result: { source: string; changed: boolean };
    expect(() => { result = flatten(source); }).not.toThrow();

    expect(result!.changed).toBe(true);
    expect(result!.source).toContain('const foo = useFoo()');
    expect(result!.source).toContain('const bar = useBar()');
    expect(result!.source).toContain('foo.x');
    expect(result!.source).toContain('bar.url');
  });

  it('handles three flattenable decls in source order without crashing', () => {
    const source = [
      `import { component$ } from '@qwik.dev/core';`,
      `export default component$(() => {`,
      `  const { a } = useAlpha();`,
      `  const { b } = useBeta();`,
      `  const { g } = useGamma();`,
      `  return <div>{a}{b}{g}</div>;`,
      `});`,
    ].join('\n');

    let result: { source: string; changed: boolean };
    expect(() => { result = flatten(source); }).not.toThrow();
    expect(result!.changed).toBe(true);
    expect(result!.source).toContain('const alpha = useAlpha()');
    expect(result!.source).toContain('const beta = useBeta()');
    expect(result!.source).toContain('const gamma = useGamma()');
  });

  it('rewrites references in subsequent decl initializers (cross-decl reference)', () => {
    const source = [
      `import { component$ } from '@qwik.dev/core';`,
      `export default component$(() => {`,
      `  const { url } = useFoo();`,
      `  const { val } = useBar(url);`,
      `  return <div>{val}</div>;`,
      `});`,
    ].join('\n');

    const { source: out, changed } = flatten(source);
    expect(changed).toBe(true);
    expect(out).toContain('const foo = useFoo()');
    expect(out).toContain('useBar(foo.url)');
    expect(out).toContain('const bar = useBar(foo.url)');
  });

  it('skips marker-suffixed callees ($-ending) so use*$ extraction isn\'t disturbed', () => {
    const source = [
      `import { component$, useTask$ } from '@qwik.dev/core';`,
      `export default component$(() => {`,
      `  const { value } = useTask$(({ track }) => track());`,
      `  return <div>{value}</div>;`,
      `});`,
    ].join('\n');

    const { source: out, changed } = flatten(source);
    expect(changed).toBe(false);
    expect(out).toBe(source);
  });
});
