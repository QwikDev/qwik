
import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function transformDefault(source: string, extra: Record<string, unknown> = {}) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    mode: 'test',
    transpileTs: true,
    transpileJsx: true,
    ...extra,
  } as Parameters<typeof transformModule>[0]);
}

function findComponentBodySegment(result: ReturnType<typeof transformModule>) {
  return result.modules.find(
    (m) => m.kind === 'segment' && m.segment.ctxName === 'component$',
  );
}

describe('JSX tag-name rewrite for const {X} = props destructures', () => {
  describe('Positive: JSXIdentifier in tag position rewrites to props.X', () => {
    it('self-closing tag: `const {Model} = props; <Model/>` → `_jsxSorted(props.Model, …)`', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
export const App = component$((props) => {
  const {Model} = props;
  return <Model class="x"/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App component-body segment missing');
      expect(body.code).not.toMatch(/const\s*\{\s*Model\s*\}\s*=\s*props\s*;/);
      expect(body.code).toMatch(/_jsxSorted\(\s*props\.Model\s*,/);
      expect(body.code).not.toMatch(/_jsxSorted\(\s*Model\s*,/);
    });

    it('paired tag: `<X>child</X>` → `<props.X>child</props.X>` (both opening + closing rewritten)', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
export const App = component$((props) => {
  const {Wrapper} = props;
  return <Wrapper>hi</Wrapper>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App component-body segment missing');
      expect(body.code).toMatch(/_jsxSorted\(\s*props\.Wrapper\s*,/);
    });

    it('mixed: regular Identifier ref + JSX tag ref + decl removal in same body', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
export const App = component$((props) => {
  const {Model, count} = props;
  return <Model data-n={count}/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App component-body segment missing');
      expect(body.code).not.toMatch(/const\s*\{\s*Model\s*,\s*count\s*\}\s*=\s*props\s*;/);
      expect(body.code).toMatch(/_jsxSorted\(\s*props\.Model\s*,/);
      expect(body.code).toMatch(/_wrapProp\(\s*props\s*,\s*"count"\s*\)/);
      expect(body.code).not.toMatch(/"data-n":\s*count\b/);
    });
  });

  describe('Negative scope: non-reference JSXIdentifier positions are not rewritten', () => {
    it('JSX attribute name is NOT a reference — preserved literally', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
export const App = component$((props) => {
  const {model} = props;
  return <div model={model}/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App component-body segment missing');
      expect(body.code).toMatch(/\bmodel:\s*_wrapProp\(\s*props\s*,\s*"model"\s*\)/);
      expect(body.code).not.toMatch(/"props\.model":/);
      expect(body.code).not.toMatch(/\bprops\.model\s*:/);
    });
  });

  describe('Negative scope: no body destructure → no rewrite', () => {
    it('`<X/>` without a `const {X} = props` decl → tag stays as `X` (untouched)', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
import { X } from './x';
export const App = component$(() => {
  return <X/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App component-body segment missing');
      expect(body.code).toMatch(/_jsxSorted\(\s*X\s*,/);
      expect(body.code).not.toMatch(/_jsxSorted\(\s*props\.X\s*,/);
    });
  });
});
