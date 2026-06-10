/**
 * Regression tests for OSS-412 — bare-expression `_fnSignal` hoisting
 * for defaulted destructure props.
 *
 * Pre-fix bug: when a JSX prop value was a bare Identifier `some` referring
 * to a defaulted destructure local (`<div some={some}/>` where `some = 1+2`
 * in the parent destructure), raw-props consolidation rewrote the source
 * to `some={(_rawProps.some ?? 1+2)}` (with parens for runtime safety),
 * then inline-body re-parsed and `analyzeSignalExpression` saw a
 * `ParenthesizedExpression` it had no case for — returning `'none'` and
 * falling through to inline emission (`some: _rawProps.some ?? 1 + 2`).
 *
 * Fix: `analyzeSignalExpression` now unwraps `ParenthesizedExpression` at
 * the top of the dispatch, mirroring the existing unwrap inside
 * `analyzeMemberExpression`. The inner LogicalExpression then takes the
 * `tryBuildFnSignal` branch and emits `_fnSignal(_hf<n>, [_rawProps],
 * _hf<n>_str)` matching SWC's output.
 *
 * Companion to convergence's `example_props_optimization` (bug 4 of 4
 * blocking the flip — sibling of OSS-413 bag split + OSS-414 paren norm).
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('OSS-412: bare-expression _fnSignal hoist for defaulted prop', () => {
  it('hoists `some={some}` to _fnSignal when `some` is defaulted', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1+2}) => {
  return <div some={some}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // Hoisted bare-expression _hf<n> declared at module level.
    expect(code).toMatch(/const _hf0\b[^=]*=\s*\(p0\)\s*=>\s*p0\.some\s*\?\?\s*3/);
    // _str preserves source `1+2` (folding only applied to lambda body per OSS-411).
    expect(code).toMatch(/_hf0_str\s*=\s*["']p0\.some\?\?1\+2["']/);
    // JSX emits `_fnSignal(_hf0, [_rawProps], _hf0_str)` for the bare prop.
    expect(code).toMatch(/some:\s*_fnSignal\(_hf0,\s*\[_rawProps\],\s*_hf0_str\)/);
    // No inline `_rawProps.some ?? 1 + 2` (the prop is now hoisted).
    expect(code).not.toMatch(/some:\s*_rawProps\.some\s*\?\?\s*1\s*\+\s*2/);
  });

  it('still uses _wrapProp for non-defaulted destructure prop locals', () => {
    // Counter-test — `count` has no default. Should be `_wrapProp(_rawProps, "count")`
    // not `_fnSignal`. Confirms the unwrap doesn't over-hoist.
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({count}) => {
  return <div class={count}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/class:\s*_wrapProp\(_rawProps,\s*["']count["']\)/);
    expect(code).not.toMatch(/class:\s*_fnSignal/);
  });

  it('unwraps ParenthesizedExpression in JSX prop values from non-rawProps sources', () => {
    // Generic ParenthesizedExpression unwrap — even without raw-props
    // rewrites, hand-written `prop={(a + b)}` should be analyzed like
    // `prop={a + b}`. Both `a` and `b` are useStore stores → both are
    // reactive roots.
    const input = `
import { component$, useStore } from '@qwik.dev/core';
export const C = component$(() => {
  const a = useStore({ x: 1 });
  const b = useStore({ y: 2 });
  return <div prop={(a.x + b.y)}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // Either inline (acceptable) or hoisted `_fnSignal(_hf<n>, [a, b], ...)`
    // is fine — the assertion is that the unwrap does not crash or skip
    // the analysis entirely.
    expect(code).toContain('_fnSignal');
  });

  it('hoists separately when both bare and object forms of the same defaulted local appear', () => {
    // Works's actual shape from example_props_optimization: `<div some={some}
    // params={{some}}/>`. SWC emits TWO _hf helpers (one bare, one object);
    // both fold `1+2 → 3` in the lambda but preserve `1+2` in _str.
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1+2}) => {
  return <div some={some} params={{some}}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // Bare-expression _hf0: lambda emits `(p0) => p0.some ?? 3`.
    expect(code).toMatch(/const _hf0\b[^=]*=\s*\(p0\)\s*=>\s*p0\.some\s*\?\?\s*3/);
    // Object-expression _hf1: lambda emits `(p0) => ({ some: p0.some ?? 3 })`.
    expect(code).toMatch(/const _hf1\b[^=]*=\s*\(p0\)\s*=>\s*\(?\{\s*some:\s*\(?p0\.some\s*\?\?\s*3/);
    // Both prop values reference their respective _hf.
    expect(code).toMatch(/some:\s*_fnSignal\(_hf0,/);
    expect(code).toMatch(/params:\s*_fnSignal\(_hf1,/);
  });
});
