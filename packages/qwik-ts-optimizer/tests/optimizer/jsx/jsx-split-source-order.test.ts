
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

describe('_jsxSplit source-ordered emission', () => {
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

    expect(seg.code).not.toContain('_getVarProps');
    expect(seg.code).not.toContain('_getConstProps');
    expect(seg.code).toMatch(/\.\.\.props\.foo/);
    expect(seg.code).toMatch(/\.\.\.props\.rest/);

    expect(seg.code).toMatch(
      /"q-e:hi":[^,]+,\s*\.\.\.props\.foo,\s*"q-e:hello":[^,]+,\s*\.\.\.props\.rest/,
    );

    expect(seg.code).toMatch(/"q-e:const":[^,}]+,\s*asd:\s*['"]1['"]/);
  });

  it('single-spread + real-const: keeps the wrapper-based path (contract)', () => {
    const source = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1 + 2, ...rest}) => {
  return <div {...rest} override>hi</div>;
});
`;
    const result = transform(source);
    const seg = findComponentSegment(result, 'C_component_');
    if (seg?.kind !== 'segment') throw new Error('expected segment');

    expect(seg.code).toContain('_getVarProps');
    expect(seg.code).toContain('_getConstProps');
  });

  it('multi-spread + no real-const-after (only event handlers): falls through to wrappers', () => {
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

    expect(seg.code).not.toContain('_getVarProps');
    expect(seg.code).not.toContain('_getConstProps');
    expect(seg.code).toMatch(/\.\.\.props\.foo/);
    expect(seg.code).toMatch(/\.\.\.props\.bar/);
    expect(seg.code).toMatch(/title:\s*['"]hello['"]/);
  });
});
