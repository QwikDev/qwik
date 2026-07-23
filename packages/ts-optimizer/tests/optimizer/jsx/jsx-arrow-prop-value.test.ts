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
      m.segment.ctxName === 'component$'
  );
}

describe('JSX inside arrow-function bodies on JSX prop values', () => {
  it("Bug A: inner JSX in `() => <p>…</p>` prop value gets Qwik's `_jsxSorted`, not React `_jsx`", () => {
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

    expect(seg.code).toMatch(/onRejected:\s*\(\)\s*=>\s*\/\*#__PURE__\*\/\s*_jsxSorted\("p"/);
    expect(seg.code).not.toContain('react/jsx-runtime');
    expect(seg.code).not.toMatch(/_jsx\(/);
  });

  it("Bug A: inner JSX in `(arg) => …<X/>` prop value gets Qwik's rewrite (with logical operator)", () => {
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

    expect(seg.code).toMatch(/src:\s*`\$\{props\.src\}`/);
    expect(seg.code).not.toMatch(/src:\s*_fnSignal/);
  });

  it('Bug C negative-scope: `<div data-x={props.a.b + "lit"}/>` (BinaryExpression with deep member) STILL hoists', () => {
    const source = `
import { component$ } from "@qwik.dev/core";
export default component$((props: any) => {
  return <div data-x={props.myobj.id + "test"} />;
});
`;
    const result = transform(source);
    const seg = findComponentSegment(result, 'test_component_');
    if (seg?.kind !== 'segment') throw new Error('expected segment');

    expect(seg.code).toMatch(/"data-x":\s*_fnSignal\(/);
  });

  it('Bug C negative-scope: `<div class={[props.class, "extra"]}/>` (ArrayExpression) STILL hoists', () => {
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
