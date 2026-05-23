/**
 * Regression tests for OSS-426 — stripped-QRL parent emission cleanup
 * (Sub-B of the OSS-424 F5 server-marker stripping umbrella).
 *
 * Two coupled behaviors diverging from SWC pre-OSS-426:
 *
 * 1. **`.w([captures])` wrapping on stripped QRLs in parent JSX.**
 *    TS emitted `shouldRemove$: q_qrl_*.w([state])` for stripped event
 *    handlers. SWC emits bare `q_qrl_*` — the body is `= null`, captures
 *    are runtime-irrelevant, the wrapper is dead weight.
 *
 * 2. **Capture metadata divergence.** SWC's `Parent_component_div_shouldRemove_*`
 *    metadata has `captures: false` even though the source closure reads
 *    `state.text`. SWC's `Parent_component_useClientMount_*` (stripped
 *    via `stripCtxName`) keeps `captures: true, captureNames: ["state"]`.
 *    Rule: `stripEventHandlers`-stripped segments suppress capture
 *    metadata; `stripCtxName`-stripped segments preserve it.
 *
 * Fix touches two sites:
 *  - `rewrite/inline-body.ts:transformInlineSegmentBody` — gates the
 *    `.w(...)` JSX-prop emission on `!isStrippedSegment(child, ...)`.
 *    Two new params (`stripCtxName`, `stripEventHandlers`) threaded
 *    from `inlineOptions` at the call site in `output-assembly.ts`.
 *  - `transform/segment-generation.ts:generateAllSegmentModules` —
 *    sibling to the existing OSS-389 loc-zeroing block: clears
 *    `captures` and `captureNames` on `eventHandler`-kind stripped
 *    segments when `stripEventHandlers: true` is set.
 *
 * Together with Sub-A (OSS-425) and Sub-D (OSS-428), forms the F5 fix
 * stack. Sub-B alone doesn't flip an additional convergence test —
 * `strip_client_code` has independent divergences (the deferred G
 * issue: inline-strategy uses `s_<hash>` short-form naming while SWC
 * uses `Parent_component_<…>` long-form) — but eliminates the
 * runtime-incorrect `.w([state])` wrap on null-body QRLs and aligns
 * capture metadata with SWC's two-arm policy.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModule, SegmentMetadataInternal } from '../../src/optimizer/types.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

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

describe('OSS-426: stripped-QRL parent emission cleanup', () => {
  it('stripEventHandlers: parent emits bare q_X for stripped handlers (no .w wrap)', () => {
    const input = `
import { component$, useStore } from '@qwik.dev/core';
export const Parent = component$(() => {
  const state = useStore({ text: '' });
  return <div shouldRemove$={() => state.text} onClick$={() => console.log(state)}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
      entryStrategy: { type: 'inline' },
      stripEventHandlers: true,
    });
    const parent = findParent(result);
    // Stripped handlers appear as bare `q_qrl_X` references, NOT `q_qrl_X.w(...)`.
    // Match the const-props bag entries — `shouldRemove$: q_qrl_X` and
    // `"q-e:click": q_qrl_X` (no `.w` suffix).
    expect(parent.code).toMatch(/shouldRemove\$: q_qrl_\d+,/);
    expect(parent.code).toMatch(/"q-e:click": q_qrl_\d+/);
    // Explicit: no .w call appears after either stripped QRL in JSX position.
    expect(parent.code).not.toMatch(/shouldRemove\$: q_qrl_\d+\.w\(/);
    expect(parent.code).not.toMatch(/"q-e:click": q_qrl_\d+\.w\(/);
  });

  it('stripEventHandlers: stripped event-handler segments have captures:false', () => {
    const input = `
import { component$, useStore } from '@qwik.dev/core';
export const Parent = component$(() => {
  const state = useStore({ text: '' });
  return <div shouldRemove$={() => state.text}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
      entryStrategy: { type: 'inline' },
      stripEventHandlers: true,
    });
    const seg = findSegmentByCtx(result, 'shouldRemove$');
    if (seg.kind !== 'segment') throw new Error('expected segment');
    // Body closure reads `state.text` — captures would normally be
    // populated. Under stripEventHandlers, SWC clears them. The
    // `captureNames` field lives on `SegmentMetadataInternal` (the
    // runtime shape) but the public `SegmentAnalysis` type doesn't
    // expose it — cast to read it for the regression check.
    const meta = seg.segment as SegmentMetadataInternal;
    expect(meta.captures).toBe(false);
    expect(meta.captureNames).toEqual([]);
  });

  it('stripCtxName-stripped segments PRESERVE capture metadata (negative-scope policy split)', () => {
    // The asymmetric arm: stripCtxName-stripped keeps capture metadata
    // even though body is `= null`. SWC's `Parent_component_useClientMount_*`
    // in example_strip_client_code has captures:true,captureNames:["state"].
    const input = `
import { component$, useClientMount$, useStore } from '@qwik.dev/core';
export const Parent = component$(() => {
  const state = useStore({ text: '' });
  useClientMount$(async () => { state.text = 'a'; });
  return <div/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
      entryStrategy: { type: 'inline' },
      stripCtxName: ['useClientMount$'],
      // Note: stripEventHandlers NOT set — only stripCtxName triggers
      // this segment's stripping; captures should survive.
    });
    const seg = findSegmentByCtx(result, 'useClientMount$');
    if (seg.kind !== 'segment') throw new Error('expected segment');
    const meta = seg.segment as SegmentMetadataInternal;
    expect(meta.captures).toBe(true);
    expect(meta.captureNames).toEqual(['state']);
  });

  it('non-stripped event handlers still receive .w([captures]) when needed (negative scope)', () => {
    // Confirm the gate doesn't accidentally suppress the wrap for
    // non-stripped handlers that DO need their captures.
    const input = `
import { component$, useStore } from '@qwik.dev/core';
export const Parent = component$(() => {
  const state = useStore({ text: '' });
  return <div onClick$={() => console.log(state)}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
      entryStrategy: { type: 'inline' },
      // No strip config — onClick$ stays a real segment.
    });
    const parent = findParent(result);
    // onClick$ should still get .w([state]).
    expect(parent.code).toMatch(/q_\w+\.w\(\[\s*state\s*\]\)/);
  });
});
