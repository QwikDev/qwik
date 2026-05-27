/**
 * Regression tests for OSS-444 — Sub-D of OSS-440 umbrella
 * (`example_immutable_analysis` parity). This is the sub-issue that flips
 * the target convergence test.
 *
 * Two coupled bugs in the default-strategy emit path:
 *
 * 1. **`buildNestedCallSites` didn't propagate `captureNames` for JSX-attr
 *    children** when `hasLoopCrossCaptures=false`. The non-JSX-attr arm
 *    already does (`segment-generation.ts:988-998`), but the
 *    `if (isJsxAttr)` arm only propagated `hoistedCaptureNames` (loop-cross
 *    path). Component-prop `<X captured$={() => state.x}>` at top level
 *    (no loop) had `captureNames=undefined` in the call site.
 *
 * 2. **`rewriteNestedCallSitesInline` didn't emit `.w([captures])` for
 *    JSX-attr refs.** The non-JSX-attr branch at `body-transforms.ts:208-209`
 *    already does. The inline-strategy path at `rewrite/inline-body.ts:242-244`
 *    also does. The default-strategy JSX-attr branch was the gap.
 *
 * Fix.
 *   - Populate `captureNames` in `buildNestedCallSites` for jsx-attr
 *     children when `!hasLoopCrossCaptures && child.captureNames.length > 0`.
 *   - In `rewriteNestedCallSitesInline`'s JSX-attr branch, use
 *     `formatWCall(qrlVar, captureNames)` for `propValueRef` when
 *     `!hoistedSymbolName && captureNames?.length > 0`.
 *
 * Bonus: also fixed a JSX flag-math gap (bit 0 / static_listeners). SWC
 * clears `static_listeners` whenever any prop's value is non-const
 * (`swc-reference-only/transform.rs:2514-2516`). TS's flag math reads
 * `hasVarEventHandler` for bit 0, but the Component-prop `*$` arm at
 * `jsx-props.ts:321-329` wasn't setting it for non-const values. Now
 * sets `hasVarEventHandler = true` when the value lands in var-bag
 * (mirrors SWC's static_listeners-clearing condition).
 *
 * Flips `example_immutable_analysis` from FAIL → PASS — convergence
 * 202/212 → 203/212.
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

function findComponentBodySegment(result: ReturnType<typeof transformModule>) {
  return result.modules.find(
    (m) => m.kind === 'segment' && m.segment.ctxName === 'component$',
  );
}

describe('OSS-444 — .w([captures]) on Component-prop QRL refs (default strategy)', () => {
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
      expect(body.code).toMatch(
        /captured\$:\s*q_[A-Za-z_0-9]+\.w\(\s*\[\s*state\s*\]\s*\)/,
      );
      // Belt and braces: the pre-fix shape (bare q_X, no .w()) must not appear.
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
      // Both captures land in the .w(...) array. Capture names sorted
      // alphabetically (capture-analysis emits sorted).
      expect(body.code).toMatch(
        /handler\$:\s*q_[A-Za-z_0-9]+\.w\(\s*\[\s*a\s*,\s*b\s*\]\s*\)/,
      );
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
      // Bare q_X — no .w(...) when there are no captures.
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
      // HTML event-handler path: prop name is `q-e:click` (eventHandler
      // ctxKind → transformEventPropName converts), value is a bare qrl
      // ref. Captures flow through the `q:p` (var-bag) propagation pattern
      // rather than a value-side `.w(...)` wrap. This pre-existing path
      // is unchanged by OSS-444 (which only adds `.w(...)` on the
      // jSXProp arm for Component-prop refs).
      expect(body.code).toMatch(/"q-e:click":\s*q_[A-Za-z_0-9]+\s*[},]/);
      // q:p captures the state binding so the bare ref can resolve it
      // at runtime.
      expect(body.code).toMatch(/"q:p":\s*state\b/);
      // The pre-fix concern: a Component-prop-style `.w(...)` should NOT
      // appear on this HTML event handler.
      expect(body.code).not.toMatch(/"q-e:click":\s*q_[A-Za-z_0-9]+\.w\(/);
    });

    it('inline strategy: pre-existing capture-wrap path at inline-body.ts:242-244 unchanged', () => {
      // The inline-strategy reference for this fix. Already worked pre-OSS-444 for
      // captured Component-prop refs; this test pins that it still works.
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

  describe('Bonus fix: JSX flag bit 0 (static_listeners) on Component element with non-const *$', () => {
    it('`<Card prop$={varValue}>` → `_jsxSorted(Card, ..., flag=2)` (bit 0 NOT set)', () => {
      // Pre-fix: TS computed flag=3 because `hasVarEventHandler` stayed
      // false for the non-const Component-prop arm. SWC computes flag=2
      // by clearing static_listeners (bit 0) for any non-const prop
      // value (transform.rs:2514-2516). With `hasVarEventHandler = true`
      // for non-const Component-prop in var-bag, TS now matches.
      const result = transformDefault(`
import { component$ } from '@qwik.dev/core';
import { Card } from './card';
export const App = component$((props) => {
  return <Card foo$={props.onClick$}/>;
});
`);
      const body = findComponentBodySegment(result);
      if (body?.kind !== 'segment') throw new Error('App body segment missing');
      // The flag arg is the 5th positional. With static_listeners cleared,
      // the flag should not have bit 0 (1) set.
      const flagMatch = body.code.match(/_jsxSorted\(\s*Card\s*,\s*[^)]+?,\s*([0-9]+)\s*,\s*"u6_/);
      expect(flagMatch).not.toBeNull();
      const flag = Number(flagMatch![1]);
      // bit 0 (static_listeners) MUST NOT be set — there's a non-const
      // event-shaped prop value in var-bag.
      expect(flag & 1).toBe(0);
    });
  });
});
