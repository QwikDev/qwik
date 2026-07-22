
import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findSegmentByCtx(
  result: { modules: readonly TransformModule[] },
  ctxName: string,
): TransformModule {
  const m = result.modules.find(
    (mod) => mod.kind === 'segment' && mod.segment.ctxName === ctxName,
  );
  if (!m) throw new Error(`segment with ctxName=${ctxName} not found`);
  return m;
}

describe('moved-decl JSX carries Qwik rewrite into the segment file', () => {
  it('pure-spread JSX in a moved helper compiles to `_jsxSplit` (not React `_jsx`)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';

function Hola(props: any) {
  return <div {...props}></div>;
}

export default component$(() => {
  return <Hola>
    <div>1</div>
    <div>2</div>
  </Hola>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
    });

    const seg = findSegmentByCtx(result, 'component$');
    expect(seg.code).toMatch(/_jsxSplit\("div", \{ \.\.\._getVarProps\(props\) \}, _getConstProps\(props\)/);
    expect(seg.code).not.toMatch(/_jsx\("div", \{ \.\.\.props \}\)/);
    expect(seg.code).not.toMatch(/from ["']react\/jsx-runtime["']/);
  });

  it('Qwik core helpers used by the moved decl get imported into the segment', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
function Hola(props: any) { return <div {...props}/>; }
export default component$(() => <Hola/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
    });

    const seg = findSegmentByCtx(result, 'component$');
    expect(seg.code).toMatch(/import \{ _jsxSplit \} from ["']@qwik\.dev\/core["']/);
    expect(seg.code).toMatch(/import \{ _getVarProps \} from ["']@qwik\.dev\/core["']/);
    expect(seg.code).toMatch(/import \{ _getConstProps \} from ["']@qwik\.dev\/core["']/);
  });

  it('non-spread JSX in a moved helper still gets rewritten (positive coverage)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
function Greet({ name }: any) { return <span>Hello {name}</span>; }
export default component$(() => <Greet name="World"/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
    });

    const seg = findSegmentByCtx(result, 'component$');
    expect(seg.code).toMatch(/_jsxSorted\("span"/);
    expect(seg.code).not.toMatch(/from ["']react\/jsx-runtime["']/);
  });

  it('fixtures without moved decls keep current behavior (negative scope)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export default component$(() => <div>hello</div>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
    });

    const seg = findSegmentByCtx(result, 'component$');
    expect(seg.code).toMatch(/_jsxSorted\("div"/);
    expect(seg.code).not.toMatch(/from ["']react\/jsx-runtime["']/);
  });
});
