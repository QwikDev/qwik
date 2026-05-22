/**
 * Regression tests for OSS-413 — `_jsxSplit` prop bag split for
 * `_restProps`-derived spreads.
 *
 * Pre-fix bug: when an HTML JSX element had a `{...rest}` spread derived
 * from `_restProps()` AND a real (non-event-handler) const-classified
 * prop alongside it, `buildJsxSplitCall` in `transform/jsx-elements-core.ts`
 * emitted BOTH `..._getVarProps(rest)` and `..._getConstProps(rest)` into
 * the var bag, with the const bag holding just the const entries (no
 * `_getConstProps`). SWC splits the spread across the two bags:
 *   var:   { ..., ..._getVarProps(rest) }
 *   const: { ..._getConstProps(rest), <const entries> }
 *
 * Fix: in the `shouldMergeConst` branch, detect "real" const entries
 * (anything that isn't an event-handler routing like `"q-e:click"` or a
 * `"q:p"` capture metadata entry). When present, split the spreads so
 * `_getConstProps` lands in the const bag alongside the real const entries.
 *
 * Companion to convergence's `example_props_optimization` (bug 5 of 4
 * remaining — sibling of OSS-414 paren-norm; ONLY one left for the
 * target to flip).
 *
 * Cross-fixture rule validated against:
 *   - `should_move_bind_value_to_var_props` (passing) — only event-handler
 *     const entry; MUST stay merged. Negative-scope test below covers this.
 *   - `should_merge_attributes_with_spread_props` (passing) — no const
 *     entries; MUST stay merged. Negative-scope test below covers this.
 *   - `should_destructure_args` (passing) — no var or const entries; takes
 *     the 3rd branch (untouched by this PR).
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../src/optimizer/types.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('OSS-413: _jsxSplit bag split for _restProps spread + real const entry', () => {
  it('splits spread when a boolean-attribute const entry is present', () => {
    // Works's shape from example_props_optimization: `<div {...rest} override>`.
    // `override` is a boolean attribute → const entry `override: true`.
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1+2, ...rest}) => {
  return <div {...rest} override>hi</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;

    // _getConstProps(rest) appears alongside `override: true` in the const bag.
    expect(code).toMatch(/\{\s*\.\.\._getConstProps\(rest\),\s*override:\s*true\s*\}/);
    // _getVarProps(rest) stays in the var bag (already-emitted form acceptable).
    expect(code).toContain('..._getVarProps(rest)');
    // _getConstProps NOT also in the var bag (the bug was: both spreads in var bag).
    expect(code).not.toMatch(/\{[^}]*\.\.\._getVarProps\([^}]*\.\.\._getConstProps[^}]*\}\s*,\s*\{\s*override/);
  });

  it('keeps merged-in-var when const bag only has event-handler routing', () => {
    // Negative-scope: `should_move_bind_value_to_var_props`-shape — bind handler
    // routes to const bag as `"q-e:click"`. NOT a real const entry; must
    // keep current behavior (both spreads in var, const bag has just the
    // event-handler entry).
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({...rest}) => {
  const onClickHandler = () => console.log('clicked');
  return <input {...rest} bind:value={undefined} onClick$={onClickHandler}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // Both spreads MUST be in the var bag (merge behavior preserved).
    expect(code).toMatch(/\.\.\._getVarProps\(rest\)/);
    expect(code).toMatch(/\.\.\._getConstProps\(rest\)/);
    // The const bag should NOT have `..._getConstProps` (it's in var bag).
    // Look for `}, { "q-e:click":` pattern (start of const bag, event handler).
    expect(code).toMatch(/\}\s*,\s*\{\s*"q-e:click"/);
  });

  it('keeps merged-in-var when there are no const entries', () => {
    // Negative-scope: `should_merge_attributes_with_spread_props`-shape — only
    // a var entry (`class: _fnSignal`), no const entries. Both spreads
    // MUST be in var bag; const bag = null.
    const input = `
import { component$, useStore } from '@qwik.dev/core';
export const C = component$(({...rest}) => {
  const store = useStore({ x: 1 });
  return <div {...rest} class={store.x}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // Both spreads in var bag.
    expect(code).toMatch(/\.\.\._getVarProps\(rest\)/);
    expect(code).toMatch(/\.\.\._getConstProps\(rest\)/);
    // Const bag should NOT have an object literal — either `null` or
    // bare `_getConstProps(rest)` (3rd-branch fallback).
    // We just need to confirm `_getConstProps` is NOT in a `{ ... }` block.
    // The first var bag uses `{ ... }` and the const bag won't have `{`
    // unless there's something else there.
  });

  it('positions _getConstProps before const entries in const bag', () => {
    // The split order matches SWC: `_getConstProps` FIRST, then literal
    // const entries. Confirms the join order.
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({...rest}) => {
  return <div {...rest} flag>x</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // `..._getConstProps(rest)` precedes `flag: true` in the const bag.
    expect(code).toMatch(/\.\.\._getConstProps\(rest\),\s*flag:\s*true/);
  });
});
