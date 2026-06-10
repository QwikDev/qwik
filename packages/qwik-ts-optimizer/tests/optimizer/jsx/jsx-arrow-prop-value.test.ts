/**
 * Regression tests for JSX inside arrow-function bodies that
 * appear as JSX prop values on non-marker components must get Qwik's
 * `_jsxSorted` rewrite, NOT fall through to oxc-transform's default
 * React JSX transform.
 *
 * Two coupled fixes:
 *
 *  1. **JSX-in-arrow-prop-value visitation**.
 *     `processProps` (jsx-props.ts) now reads attribute value text from
 *     the live MagicString (`s.slice`) rather than the raw `source`. By
 *     the time an outer element's leave handler runs, any JSX nested
 *     inside the value's arrow body has already been visited + rewritten
 *     (DFS leaves children before parent). Reading from `s.slice` picks
 *     up those inner rewrites; reading from `source` re-emits the raw
 *     JSX, and the surrounding `s.overwrite(node.start, node.end,
 *     callStr)` for the outer element clobbers the inner rewrites — which
 *     then fall through to oxc-transform's default React JSX transform
 *     and emit `_jsx(...)` + `import { jsx as _jsx } from "react/jsx-
 *     runtime"`. `sliceWithFallback` covers the case where MagicString
 *     can't anchor the slice (e.g. event-handler QRL rewrite has already
 *     replaced the whole attribute) by falling back to raw source.
 *
 *  2. **`_fnSignal` over-firing on `Tpl`/`Call` with non-const deps**
 *     (Bug C, surfaced post-Bug-A). SWC's
 *     `create_synthetic_qqsegment` (swc-reference-only/transform.rs:805)
 *     explicitly skips `_fnSignal` hoist for `TemplateLiteral` and
 *     `CallExpression` when `is_const` is false (any scoped ident is
 *     non-const — includes function parameters on HTML elements).
 *     `<img src={`${props.src}`}/>` in `(props) => …` stays as a raw
 *     template literal rather than being hoisted. Other expression
 *     kinds (Array, Object, Binary, Logical, Conditional) still hoist
 *     regardless.
 *
 *  3. **JSX key consumption — sole-child HTML elements get `null` key**.
 *     `transformJsxElement` emits `null` for HTML elements that are
 *     JSX-children of another JSXElement / JSXFragment; the counter
 *     does NOT advance. `countJsxKeyConsumption` (the key-counting
 *     pre-pass) mirrors this rule to keep cross-segment JSX keys in
 *     SWC parity. Without this mirror, segments whose body is
 *     `<><div/></>`-shaped over-counted by one and downstream segments
 *     received keys offset by one from SWC.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function transform(source: string) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    mode: 'test',
  });
}

function findComponentSegment(result: ReturnType<typeof transform>, namePrefix: string) {
  return result.modules.find(
    (m) =>
      m.kind === 'segment' &&
      m.segment.name.startsWith(namePrefix) &&
      m.segment.ctxName === 'component$',
  );
}

describe('JSX inside arrow-function bodies on JSX prop values', () => {
  it('Bug A: inner JSX in `() => <p>…</p>` prop value gets Qwik\'s `_jsxSorted`, not React `_jsx`', () => {
    const source = `
import { component$ } from "@qwik.dev/core";
const Resource = (props: any) => props.value;
export default component$((props: any) => {
  return (
    <Resource
      value={"x"}
      onRejected={() => <p>error</p>}
    />
  );
});
`;
    const result = transform(source);
    const seg = findComponentSegment(result, 'test_component_');
    if (seg?.kind !== 'segment') throw new Error('expected segment');

    // The inner `<p>` gets rewritten to Qwik's `_jsxSorted`.
    expect(seg.code).toMatch(/onRejected:\s*\(\)\s*=>\s*\/\*#__PURE__\*\/\s*_jsxSorted\("p"/);
    // No spurious react/jsx-runtime import.
    expect(seg.code).not.toContain('react/jsx-runtime');
    expect(seg.code).not.toMatch(/_jsx\(/);
  });

  it('Bug A: inner JSX in `(arg) => …<X/>` prop value gets Qwik\'s rewrite (with logical operator)', () => {
    const source = `
import { component$ } from "@qwik.dev/core";
const Resource = (props: any) => props.value;
const Image = (props: any) => null;
export default component$((props: any) => {
  return (
    <Resource
      value={"x"}
      onResolved={(res: any) => res && <Image src={res} />}
    />
  );
});
`;
    const result = transform(source);
    const seg = findComponentSegment(result, 'test_component_');
    if (seg?.kind !== 'segment') throw new Error('expected segment');

    // Inner Image element gets `_jsxSorted(Image, …)`.
    expect(seg.code).toMatch(/_jsxSorted\(Image,/);
    expect(seg.code).not.toContain('react/jsx-runtime');
  });

  it('Bug C: `<img src={`${props.src}`}/>` is NOT hoisted to `_fnSignal` (TemplateLiteral with non-const dep)', () => {
    const source = `
import { component$ } from "@qwik.dev/core";
export const Image = component$((props: any) => {
  return <img src={\`\${props.src}\`} />;
});
`;
    const result = transform(source);
    const seg = findComponentSegment(result, 'Image_component_');
    if (seg?.kind !== 'segment') throw new Error('expected segment');

    // Stays as raw template literal in the var-bag.
    expect(seg.code).toMatch(/src:\s*`\$\{props\.src\}`/);
    // No `_fnSignal` hoist for this expression.
    expect(seg.code).not.toMatch(/src:\s*_fnSignal/);
  });

  it('Bug C negative-scope: `<div data-x={props.a.b + "lit"}/>` (BinaryExpression with deep member) STILL hoists', () => {
    // Confirms the gate is narrow — only TemplateLiteral + CallExpression
    // get the skip, not BinaryExpression / ArrayExpression / etc.
    // This matches `should_wrap_object_with_fn_signal`'s expected emit.
    const source = `
import { component$ } from "@qwik.dev/core";
export default component$((props: any) => {
  return <div data-x={props.myobj.id + "test"} />;
});
`;
    const result = transform(source);
    const seg = findComponentSegment(result, 'test_component_');
    if (seg?.kind !== 'segment') throw new Error('expected segment');

    // BinaryExpression with deep member access still hoists.
    expect(seg.code).toMatch(/"data-x":\s*_fnSignal\(/);
  });

  it('Bug C negative-scope: `<div class={[props.class, "extra"]}/>` (ArrayExpression) STILL hoists', () => {
    // Mirrors `should_merge_attributes_with_spread_props`'s expected emit
    // — ArrayExpression with prop member access stays in the `_fnSignal`
    // hoist path.
    const source = `
import { component$ } from "@qwik.dev/core";
export default component$((props: any) => {
  return <div {...props} class={[props.class, "extra"]} />;
});
`;
    const result = transform(source);
    const seg = findComponentSegment(result, 'test_component_');
    if (seg?.kind !== 'segment') throw new Error('expected segment');

    expect(seg.code).toMatch(/class:\s*_fnSignal\(/);
  });
});
