/**
 * Regression tests for OSS-441 — Sub-A of OSS-440 umbrella
 * (`example_immutable_analysis` parity).
 *
 * After OSS-438's ctxKind harmonisation, Component-prop `$`-suffix attrs
 * are correctly classified as `ctxKind: "jSXProp"`. `buildNestedCallSites`
 * in `transform/segment-generation.ts` was never updated to mirror that —
 * its `isJsxAttr` predicate only recognised `eventHandler`, sending every
 * `jSXProp` child segment through the bare-identifier `else` branch in
 * `segment-codegen/body-transforms.ts`. Result: the parent body's
 * `<Component onProp$={…}>` attribute got replaced with bare
 * `<Component q_App_..._onProp_*>` — invalid JSX attribute syntax — and
 * the downstream JSX walker (silently) no-op'd the segment.
 *
 * Fix: extend the predicate to include `jSXProp`. The inner branch's
 * `isComponentEvent` arm already does the right thing (keep callee raw)
 * because `ctxKind === 'jSXProp'` ⊂ `isComponentEvent === true` per
 * `extract.ts:1075/1077`.
 *
 * Doesn't flip `example_immutable_analysis` on its own — Sub-B (destructure
 * inlining), Sub-C (TS-annotation strip), and Sub-D (post-Sub-A surfaced
 * bugs) are still open under the umbrella.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

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

/**
 * Find the segment module that holds the parent component's body — this
 * is where post-extraction JSX rewriting against `_jsxSorted` lands under
 * the default entry strategy.
 */
function findComponentBodySegment(result: ReturnType<typeof transformModule>) {
  return result.modules.find(
    (m) => m.kind === 'segment' && m.segment.ctxName === 'component$',
  );
}

describe('OSS-441 — jSXProp ctxKind recognised as JSX-attr call site', () => {
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
      // Named prop must survive into the _jsxSorted call. Pre-fix the body
      // contained bare `q_App_..._onProp_*` instead — the JSX walker
      // silently no-op'd on the invalid attribute syntax.
      expect(body.code).toMatch(
        /_jsxSorted\(\s*Card\s*,\s*null\s*,\s*\{\s*onProp\$:\s*q_[A-Za-z_0-9]+\s*\}/,
      );
      // Belt and braces: assert the bare-identifier failure mode is gone.
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
      // The raw `transparent$:` key proves `transformEventPropName` did NOT
      // run (which would have produced `q-e:transparent`) — i.e. the
      // isComponentEvent arm correctly fired for the jSXProp ctxKind.
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
      // HTML element + `on*$` → ctxKind=eventHandler → transformEventPropName
      // converts `onClick$` to `q-e:click`. Baseline behavior unchanged.
      expect(body.code).toMatch(/"q-e:click":\s*q_[A-Za-z_0-9]+/);
      // The new predicate must NOT cause HTML attrs to leak through as raw
      // `onClick$:` — that would regress every HTML-event-handler fixture.
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
      // Pin the classification — OSS-441's predicate change must not
      // accidentally rewrite metadata; that lives upstream in extract.ts
      // and was OSS-438's domain.
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
