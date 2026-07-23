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

function transformInline(source: string, extra: Record<string, unknown> = {}) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'inline' },
    mode: 'test',
    transpileTs: true,
    transpileJsx: true,
    ...extra,
  } as Parameters<typeof transformModule>[0]);
}

function transformHoist(source: string, extra: Record<string, unknown> = {}) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'hoist' },
    mode: 'test',
    transpileTs: true,
    transpileJsx: true,
    ...extra,
  } as Parameters<typeof transformModule>[0]);
}

function findComponentBodySegment(result: ReturnType<typeof transformModule>) {
  return result.modules.find((m) => m.kind === 'segment' && m.segment.ctxName === 'component$');
}

describe('.w([captures]) on Component-prop QRL refs (default strategy)', () => {
  describe('Positive: captured Component-prop emits .w(...) wrap', () => {
    it('single capture: `<Card captured$={() => state.x}>` → `captured$: q_X.w([state])`', () => {
      const result = transformDefault(`
import { component$, useStore } from '@qwik.dev/core';
import { Card } from './card';
export const App = component$(() => {
  const state = useStore({x: 0});
  return <Card captured$={() => state.x}/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App body segment missing');
      expect(body.code).toMatch(/captured\$:\s*q_[A-Za-z_0-9]+\.w\(\s*\[\s*state\s*\]\s*\)/);
      expect(body.code).not.toMatch(/captured\$:\s*q_[A-Za-z_0-9]+\s*[,}]/);
    });

    it('multiple captures: prop captures two outer-scope vars', () => {
      const result = transformDefault(`
import { component$, useStore } from '@qwik.dev/core';
import { Card } from './card';
export const App = component$(() => {
  const a = useStore({n: 1});
  const b = useStore({n: 2});
  return <Card handler$={() => a.n + b.n}/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App body segment missing');
      expect(body.code).toMatch(/handler\$:\s*q_[A-Za-z_0-9]+\.w\(\s*\[\s*a\s*,\s*b\s*\]\s*\)/);
    });
  });

  describe('Negative scope: non-capturing Component-prop emits bare q_X', () => {
    it('`<Card static$={() => "hi"}>` (no captures) → no .w()', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
import { Card } from './card';
export const App = component$(() => {
  return <Card static$={() => "hi"}/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App body segment missing');
      expect(body.code).toMatch(/static\$:\s*q_[A-Za-z_0-9]+\s*[,}]/);
      expect(body.code).not.toMatch(/static\$:\s*q_[A-Za-z_0-9]+\.w\(/);
    });
  });

  describe('Negative scope: existing paths unchanged', () => {
    it('HTML event handler with captures (eventHandler ctxKind, not jSXProp) — still `q-e:click` with q:p propagation', () => {
      const result = transformDefault(`
import { component$, useStore } from '@qwik.dev/core';
export const App = component$(() => {
  const state = useStore({x: 0});
  return <div onClick$={() => state.x}>x</div>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App body segment missing');
      expect(body.code).toMatch(/"q-e:click":\s*q_[A-Za-z_0-9]+\s*[},]/);
      expect(body.code).toMatch(/"q:p":\s*state\b/);
      expect(body.code).not.toMatch(/"q-e:click":\s*q_[A-Za-z_0-9]+\.w\(/);
    });

    it('inline strategy: pre-existing capture-wrap path at inline-body.ts:242-244 unchanged', () => {
      const result = transformInline(`
import { component$, useStore } from '@qwik.dev/core';
import { Card } from './card';
export const App = component$(() => {
  const state = useStore({x: 0});
  return <Card captured$={() => state.x}/>;
});
`);
      const parent = result.modules[0];
      expect(parent.code).toMatch(/captured\$:\s*q_[A-Za-z_0-9]+\.w\(\s*\[\s*state\s*\]\s*\)/);
    });
  });

  describe('.w([captures]) on bare-$() QRL refs in JSX props (inline/hoist strategy)', () => {
    for (const [label, transform] of [
      ['inline', transformInline],
      ['hoist', transformHoist],
    ] as const) {
      it(`${label}: capturing \`ref={$((el) => props.ref.value = el)}\` → \`ref: q_X.w([props])\``, () => {
        const result = transform(`
import { component$, $ } from '@qwik.dev/core';
import { Comp } from './comp';
export const Render = component$((props) => {
  return <Comp ref={$((el) => { if (props.ref) props.ref.value = el; })}/>;
});
`);
        const parent = result.modules[0];
        expect(parent.code).toMatch(/ref:\s*q_[A-Za-z_0-9]+\.w\(\s*\[\s*props\s*\]\s*\)/);
        expect(parent.code).not.toMatch(/ref:\s*q_[A-Za-z_0-9]+\s*[,}]/);
      });

      it(`${label}: non-capturing bare \`$()\` ref → bare q_X, no .w()`, () => {
        const result = transform(`
import { component$, $ } from '@qwik.dev/core';
import { Comp } from './comp';
export const Render = component$(() => {
  return <Comp ref={$((el) => console.log(el))}/>;
});
`);
        const parent = result.modules[0];
        expect(parent.code).toMatch(/ref:\s*q_[A-Za-z_0-9]+\s*[,}]/);
        expect(parent.code).not.toMatch(/ref:\s*q_[A-Za-z_0-9]+\.w\(/);
      });
    }
  });

  describe('Bonus fix: JSX flag bit 0 (static_listeners) on Component element with non-const *$', () => {
    it('`<Card prop$={varValue}>` → `_jsxSorted(Card, ..., flag=2)` (bit 0 NOT set)', () => {
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
import { Card } from './card';
export const App = component$((props) => {
  return <Card foo$={props.onClick$}/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App body segment missing');
      const flagMatch = body.code.match(/_jsxSorted\(\s*Card\s*,\s*[^)]+?,\s*([0-9]+)\s*,\s*"u6_/);
      expect(flagMatch).not.toBeNull();
      const flag = Number(flagMatch![1]);
      expect(flag & 1).toBe(0);
    });
  });
});
