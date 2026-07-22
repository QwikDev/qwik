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

describe('jSXProp ctxKind recognised as JSX-attr call site', () => {
  describe('Positive: Component-prop `$`-suffix attrs emit named props post-jsxify', () => {
    it('`<Card onProp$={() => …}>` → component body segment emits `onProp$: q_X` (not bare `q_X`)', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
import { Card } from './card';
export const App = component$(() => {
  return <Card onProp$={() => 1}/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App component-body segment missing');
      expect(body.code).toMatch(
        /_jsxSorted\(\s*Card\s*,\s*null\s*,\s*\{\s*onProp\$:\s*q_[A-Za-z_0-9]+\s*\}/,
      );
      expect(body.code).not.toMatch(/<Card\s+q_[A-Za-z_0-9]+_onProp_/);
    });

    it('`<Card transparent$={() => …}>` (non-`on*` Component-prop) → callee kept raw', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
import { Card } from './card';
export const App = component$(() => {
  return <Card transparent$={() => 'hi'}/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App component-body segment missing');
      expect(body.code).toMatch(
        /_jsxSorted\(\s*Card\s*,\s*null\s*,\s*\{\s*transparent\$:\s*q_[A-Za-z_0-9]+\s*\}/,
      );
    });
  });

  describe('Negative scope: HTML eventHandler ctxKind unchanged', () => {
    it('`<div onClick$={() => …}>` → still emits `q-e:click` (HTML event-handler path preserved)', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div onClick$={() => 1}>x</div>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App component-body segment missing');
      expect(body.code).toMatch(/"q-e:click":\s*q_[A-Za-z_0-9]+/);
      expect(body.code).not.toMatch(/\bonClick\$:\s*q_/);
    });
  });

  describe('Negative scope: ctxKind classification unchanged by predicate extension', () => {
    it('Component + onProp$ + transpileJsx=true → jSXProp metadata preserved', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
import { Card } from './card';
export const App = component$(() => {
  return <Card onProp$={() => 1}/>;
});
`);
      const handler = result.modules.find(
        (m) => m.kind === 'segment' && m.segment.ctxName === 'onProp$',
      );
      if (handler?.kind !== 'segment') throw new Error('Card onProp$ segment missing');
      expect(handler.segment.ctxKind).toBe('jSXProp');
    });

    it('HTML + onClick$ + transpileJsx=true → eventHandler metadata preserved', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div onClick$={() => 1}>x</div>;
});
`);
      const handler = result.modules.find(
        (m) => m.kind === 'segment' && m.segment.ctxName === 'onClick$',
      );
      if (handler?.kind !== 'segment') throw new Error('div onClick$ segment missing');
      expect(handler.segment.ctxKind).toBe('eventHandler');
    });
  });
});
