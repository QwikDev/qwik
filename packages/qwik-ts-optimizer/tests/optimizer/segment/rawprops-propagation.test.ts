/**
 * Regression tests for propagating `_rawProps` consolidation to
 * nested extractions under Inline entry strategy.
 *
 * Pre-fix bug: `promoteEventHandlerCaptures` (`event-capture-promotion.ts`)
 * unconditionally moved nested-eventHandler captures from `captureNames`
 * → padded `paramNames` (`['_', '_1', 'atom', 'ctx']`). Under Inline
 * strategy, the downstream `preConsolidateRawPropsCaptures` then saw
 * empty `captureNames` and had nothing to consolidate. The fix gates the
 * non-loop padding on entry strategy: for `inline` only (NOT `hoist`),
 * captures stay in `captureNames` so the `_captures[N]` unpacking +
 * `_rawProps.X` rewriting pipeline can fire correctly.
 *
 * Companion to convergence's `example_optimization_issue_3542` (target).
 * The `hoist`-vs-`inline` distinction is exercised via `example_issue_33443`
 * (passing baseline) which uses `hoist` and DOES need the param-padding.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('Inline strategy keeps captureNames intact for non-loop nested handlers', () => {
  it('emits inline-style body with _captures[N] unpacking + _rawProps.X rewriting', () => {
    // Mirror of `example_optimization_issue_3542`'s shape:
    // component with destructured props + nested eventHandler that
    // captures the destructured names. Inline strategy should:
    //   1. Consolidate the destructure to `_rawProps` in the component body
    //   2. Propagate the consolidation to the nested handler's captureNames
    //   3. Inject `const _rawProps = _captures[0]` in the handler body
    //   4. Rewrite `atom`/`ctx` references to `_rawProps.atom`/`_rawProps.ctx`
    //   5. Wrap the QRL ref in `.w([_rawProps])` on the parent JSX attr
    const input = `
import { component$ } from '@qwik.dev/core';

export const AtomStatus = component$(({ctx, atom}) => {
  return (
    <span onClick$={(ev) => atomStatusClick(ctx, ev, [atom])}>
    </span>
  );
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const parent = findParent(result);
    const code = parent.code;

    // (1) `_captures` import threaded through (cascades from #3).
    expect(code).toContain('_captures');
    // (3) `_captures[0]` unpacking injected in the eventHandler body.
    expect(code).toContain('_rawProps = _captures[0]');
    // (4) Handler body references `_rawProps.atom` / `_rawProps.ctx` (NOT raw `atom`/`ctx`).
    expect(code).toContain('_rawProps.atom');
    expect(code).toContain('_rawProps.ctx');
    // (5) Parent JSX attr wraps the QRL ref via `.w([_rawProps])`.
    // Match any QRL var (prod mode renames symbols to `q_s_<hash>` form).
    expect(code).toMatch(/q_\w+\.w\(\[\s*_rawProps\s*\]\)/);
    // The pre-fix bug emitted `(_, _1, atom, ctx) => atomStatusClick(ctx, ev, [atom])`.
    // Negative check: the bad shape MUST NOT be present anywhere in the parent.
    expect(code).not.toMatch(/\(_,\s*_1,\s*atom,\s*ctx\)\s*=>/);
  });

  it('keeps Hoist strategy unchanged — still pads paramNames with (_, _1, capture)', () => {
    // `hoist` strategy must keep the segment-file-style positional param
    // padding (`(_, _1, capture) => body`) — the downstream Hoist emission
    // path expects this shape. This test pins that the fix is narrowed to
    // `inline` only (NOT `hoist`).
    //
    // Mirror of `example_issue_33443`'s shape: component with destructured
    // props + useSignal + nested button onClick that captures the local
    // counter (NOT a destructured prop). Under Hoist strategy, this should
    // emit `const X = (_, _1, counter) => counter.value++;` per SWC.
    const input = `
import { component$, useSignal } from '@qwik.dev/core';

export const Foo = component$(({description = '', other}: any) => {
  const counter = useSignal(0);
  return (
    <button onClick$={() => counter.value++}>
      Increment
    </button>
  );
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'hoist' },
      transpileTs: true,
      transpileJsx: true,
    });

    const parent = findParent(result);
    const code = parent.code;

    // Hoist strategy emits `const X = (_, _1, capture) => body;` form.
    expect(code).toMatch(/=\s*\(_,\s*_1,\s*counter\)\s*=>\s*counter\.value\+\+/);
    // No `_captures` unpacking (that's the Inline-strategy shape).
    expect(code).not.toContain('_captures[0]');
  });

  it('default (smart) strategy keeps captureNames empty after promotion (segment-file path)', () => {
    // Under default `smart` strategy, the SEGMENT-FILE path is the consumer.
    // captureNames should be cleared and paramNames padded — the existing
    // pre-fix behavior — because the segment file's runtime contract
    // expects positional args, not `_captures[N]` unpacking.
    //
    // Mirror of the same `({ctx, atom})` destructured component, but under
    // smart strategy (default). The segment file's body has positional args.
    const input = `
import { component$ } from '@qwik.dev/core';

export const AtomStatus = component$(({ctx, atom}) => {
  return (
    <span onClick$={(ev) => atomStatusClick(ctx, ev, [atom])}>
    </span>
  );
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      // default entry strategy = 'smart'
    });

    const eventHandlerSeg = result.modules.find(
      (m) => m.kind === 'segment' && m.path.includes('span_q_e_click'),
    );
    expect(eventHandlerSeg?.code).toBeTruthy();
    // Segment-file body uses positional padded args (SWC Rule 7).
    expect(eventHandlerSeg!.code).toMatch(/\(_,\s*_1,\s*atom,\s*ctx\)\s*=>/);
  });
});

describe('q:p capture value resolves through _rawProps in the consolidated parent scope', () => {
  const INPUT = `
import { component$, useSignal } from '@qwik.dev/core';

export const Panel = component$(({ showAll }: any) => {
  return (
    <button onClick$={() => { showAll.value = true; }}>
      Show all
    </button>
  );
});
`;

  for (const strat of ['smart', 'hoist'] as const) {
    it(`${strat}: q:p delivers _rawProps.showAll, never the bare destructured name`, () => {
      const result = transformModule({
        input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(INPUT) }],
        srcDir: mkFilePath('.'),
        entryStrategy: { type: strat },
        transpileTs: true,
        transpileJsx: true,
      });

      const withQp = result.modules.find((m) => m.code.includes('"q:p"'));
      expect(withQp, 'expected a module emitting a q:p prop').toBeTruthy();
      const code = withQp!.code;

      expect(code, 'q:p value reaches the field via _rawProps').toContain('"q:p": _rawProps.showAll');
      expect(code, 'bare destructured name must not leak into the parent scope')
        .not.toMatch(/"q:p":\s*showAll\b/);
    });
  }
});
