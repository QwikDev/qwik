import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { parseWithRawTransfer } from '../../../src/optimizer/ast/parse.js';
import { flattenDestructureUseCalls } from '../../../src/optimizer/prepare/flatten-destructures.js';

function flatten(source: string): { source: string; changed: boolean } {
  const { program } = parseWithRawTransfer('test.tsx', source);
  return flattenDestructureUseCalls(source, 'test.tsx', program);
}

function parseErrorCount(source: string): number {
  return parseSync('test.tsx', source, { lang: 'tsx' }).errors.length;
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
    const source = [`const { value } = useStore();`, `export const x = value;`].join('\n');

    const { source: out, changed } = flatten(source);
    expect(changed).toBe(false);
    expect(out).toBe(source);
  });

  it('does not crash on two flattenable decls in the same scope (BENCH-01 repro)', () => {
    const source = [
      `import { component$ } from '@qwik.dev/core';`,
      `export default component$(() => {`,
      `  const { x } = useFoo();`,
      `  const { url } = useBar();`,
      `  return <div>{x}{url}</div>;`,
      `});`,
    ].join('\n');

    let result: { source: string; changed: boolean };
    expect(() => {
      result = flatten(source);
    }).not.toThrow();

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
    expect(() => {
      result = flatten(source);
    }).not.toThrow();
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

  it('leaves a renamed-import component module unchanged (never flattened; prefilter must not matter)', () => {
    const source = [
      `import { component$ as cmp } from '@qwik.dev/core';`,
      `export default cmp(() => {`,
      `  const { value } = useStore();`,
      `  return <div>{value}</div>;`,
      `});`,
    ].join('\n');

    const { source: out, changed } = flatten(source);
    expect(changed).toBe(false);
    expect(out).toBe(source);
  });

  it('still flattens when the `component$` token also appears in unrelated text', () => {
    const source = [
      `import { component$ } from '@qwik.dev/core';`,
      `// component$ mentioned in a comment too`,
      `export default component$(() => {`,
      `  const { value } = useStore();`,
      `  return <div>{value}</div>;`,
      `});`,
    ].join('\n');

    const { source: out, changed } = flatten(source);
    expect(changed).toBe(true);
    expect(out).toContain('const store = useStore()');
    expect(out).toContain('store.value');
  });

  it("skips marker-suffixed callees ($-ending) so use*$ extraction isn't disturbed", () => {
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

  it('expands an object-literal shorthand to `key: member` instead of a bare member expression', () => {
    const source = [
      `import { component$ } from '@qwik.dev/core';`,
      `export default component$(() => {`,
      `  const { value } = useStore();`,
      `  const ctx = { value };`,
      `  return <div>{ctx.value}</div>;`,
      `});`,
    ].join('\n');

    const { source: out, changed } = flatten(source);
    expect(changed).toBe(true);
    expect(out).toContain('const ctx = { value: store.value }');
    expect(out).not.toContain('{ store.value }');
    expect(parseErrorCount(out)).toBe(0);
  });

  it('expands a renamed-key shorthand using the local binding name as the key', () => {
    const source = [
      `import { component$ } from '@qwik.dev/core';`,
      `export default component$((props) => {`,
      `  const { disabledSig: isDisabled } = useBindings(props, {});`,
      `  const context = { isDisabled };`,
      `  return <div>{context.isDisabled}</div>;`,
      `});`,
    ].join('\n');

    const { source: out, changed } = flatten(source);
    expect(changed).toBe(true);
    expect(out).toContain('const bindings = useBindings(props, {})');
    expect(out).toContain('{ isDisabled: bindings.disabledSig }');
    expect(out).not.toContain('{ bindings.disabledSig }');
    expect(parseErrorCount(out)).toBe(0);
  });

  it('rewrites shorthand and explicit props in the same object literal, leaving valid JS', () => {
    const source = [
      `import { component$ } from '@qwik.dev/core';`,
      `export default component$((props) => {`,
      `  const { disabledSig: isDisabled, openSig } = useBindings(props, {});`,
      `  const context = { isDisabled, openSig, label: openSig };`,
      `  return context;`,
      `});`,
    ].join('\n');

    const { source: out, changed } = flatten(source);
    expect(changed).toBe(true);
    expect(out).toContain('isDisabled: bindings.disabledSig');
    expect(out).toContain('openSig: bindings.openSig');
    expect(out).toContain('label: bindings.openSig');
    expect(parseErrorCount(out)).toBe(0);
  });
});
