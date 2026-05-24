/**
 * Regression tests for OSS-434 — `_jsxSplit` source-ordered emission
 * for multi-spread elements with explicit real-const props.
 *
 * The new `tryBuildSourceOrderedJsxSplit` path in
 * `transform/jsx-elements-core.ts` fires for `<el spreadOrProp ... {...A}
 * ... {...B} ... const-prop/>` shapes: spreads emit as raw `...expr` in
 * the var-bag at their source position; named props placed AFTER all
 * spreads with a stable value land in the const-bag; everything else
 * (named props before/between spreads, or unstable values anywhere) goes
 * to the var-bag at its source position.
 *
 * Negative-scope tests pin that single-spread cases still use the
 * existing `_getVarProps` / `_getConstProps` wrapper-based path — OSS-413
 * + `example_spread_jsx` + `should_split_spread_props_with_additional_prop`
 * all depend on that emission shape.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

function transform(source: string) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    mode: 'test',
  });
}

/** Find the top-level `*_component_<hash>` segment (avoids matching nested
 *  event-handler / useTask$ segments that also include `_component_` in
 *  their name). */
function findComponentSegment(result: ReturnType<typeof transform>, namePrefix: string) {
  return result.modules.find(
    (m) =>
      m.kind === 'segment' &&
      m.segment.name.startsWith(namePrefix) &&
      m.segment.ctxName === 'component$',
  );
}

describe('OSS-434 — _jsxSplit source-ordered emission', () => {
  it('multi-spread + real-const-after: spreads emit raw in source order, no wrappers', () => {
    const source = `
import { component$ } from '@qwik.dev/core';
export default component$((props) => {
  return (<p
    onHi$={() => 'hi'}
    {...props.foo}
    onHello$={props.helloHandler$}
    {...props.rest}
    onConst$={() => 'const'}
    asd={"1"}
  />);
});
`;
    const result = transform(source);
    const seg = findComponentSegment(result, 'test_component_');
    if (seg?.kind !== 'segment') throw new Error('expected segment');

    // Raw spreads appear in the var-bag, no `_getVarProps` / `_getConstProps`.
    expect(seg.code).not.toContain('_getVarProps');
    expect(seg.code).not.toContain('_getConstProps');
    expect(seg.code).toMatch(/\.\.\.props\.foo/);
    expect(seg.code).toMatch(/\.\.\.props\.rest/);

    // Source order in the var-bag: q-e:hi BEFORE ...props.foo BEFORE q-e:hello
    // BEFORE ...props.rest. Compose into a single regex so the order is pinned.
    expect(seg.code).toMatch(
      /"q-e:hi":[^,]+,\s*\.\.\.props\.foo,\s*"q-e:hello":[^,]+,\s*\.\.\.props\.rest/,
    );

    // Const-bag holds only after-all-spreads stable entries. The literal
    // `"1"` from source is canonicalized to single quotes by the prop
    // simplifier; match either quote style.
    expect(seg.code).toMatch(/"q-e:const":[^,}]+,\s*asd:\s*['"]1['"]/);
  });

  it('single-spread + real-const: keeps the wrapper-based path (OSS-413 contract)', () => {
    // `<div {...rest} override>hi</div>` — OSS-413's canonical shape.
    // Single spread → SWC keeps `_getVarProps` / `_getConstProps`. The
    // source-ordered path must NOT fire here.
    const source = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1 + 2, ...rest}) => {
  return <div {...rest} override>hi</div>;
});
`;
    const result = transform(source);
    const seg = findComponentSegment(result, 'C_component_');
    if (seg?.kind !== 'segment') throw new Error('expected segment');

    // Wrapper-based emission preserved.
    expect(seg.code).toContain('_getVarProps');
    expect(seg.code).toContain('_getConstProps');
  });

  it('multi-spread + no real-const-after (only event handlers): falls through to wrappers', () => {
    // Two spreads but the only "const-like" entry after them is an
    // event handler (rewrites to `q-e:click`). Event-handler routing
    // entries DON'T qualify the wrapper-drop predicate.
    const source = `
import { component$ } from '@qwik.dev/core';
export default component$((props) => {
  return (<p
    {...props.foo}
    {...props.bar}
    onClick$={() => 'clicked'}
  />);
});
`;
    const result = transform(source);
    const seg = findComponentSegment(result, 'test_component_');
    if (seg?.kind !== 'segment') throw new Error('expected segment');

    // No real-const-after-spreads → existing wrapper-based path runs.
    expect(seg.code).toMatch(/_getVarProps|_getConstProps/);
  });

  it('multi-spread + after-all-spreads literal const: works without an event-handler in const', () => {
    const source = `
import { component$ } from '@qwik.dev/core';
export default component$((props) => {
  return (<p
    {...props.foo}
    {...props.bar}
    title={"hello"}
  />);
});
`;
    const result = transform(source);
    const seg = findComponentSegment(result, 'test_component_');
    if (seg?.kind !== 'segment') throw new Error('expected segment');

    // The new path fires — title goes to const-bag, spreads raw in var-bag.
    expect(seg.code).not.toContain('_getVarProps');
    expect(seg.code).not.toContain('_getConstProps');
    expect(seg.code).toMatch(/\.\.\.props\.foo/);
    expect(seg.code).toMatch(/\.\.\.props\.bar/);
    expect(seg.code).toMatch(/title:\s*['"]hello['"]/);
  });
});
