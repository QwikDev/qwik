/**
 * Regression tests for `_hf<n>_str` paren normalization for
 * object-form hoisted signals.
 *
 * Pre-fix bug: raw-props' `applyIdentifierReplacements` defensively wraps
 * defaulted-field accesses in `(_rawProps.X ?? default)` for runtime
 * safety. For the BARE form `<div some={some}/>`, the
 * `ParenthesizedExpression` unwrap at the top of `analyzeSignalExpression`
 * meant the inner LogicalExpression was what reached `generateFnSignal`,
 * so its source slice was paren-free. For the OBJECT form
 * `<div params={{some}}/>`, signal-analysis took the `ObjectExpression`
 * branch directly without unwrapping inner ParenthesizedExpression nodes
 * inside Property values, so the source slice INCLUDED the inner parens
 * — producing `_hf<n>_str = "{some:(p0.some??1+2)}"` (extra parens) vs
 * SWC's `"{some:p0.some??1+2}"`.
 *
 * Fix: new `collectParenStrips` helper in `signal-analysis.ts` walks the
 * expression subtree top-down with parent-context awareness; when it
 * encounters a `ParenthesizedExpression` whose direct parent is a
 * `Property` (object-literal value position), it emits two range
 * replacements: `[paren.start, inner.start] → ''` and
 * `[inner.end, paren.end] → ''`. Object-property-value position is
 * always safe to strip — SWC's printer emits the inner expression
 * directly there. Other positions (BinaryExpression operand, MemberExpression
 * object on group, etc.) are NOT stripped; those parens may be
 * load-bearing for operator precedence.
 *
 * Companion to convergence's `example_props_optimization` (paren-norm
 * closes bug 6 of 6 surfaced in the audit, but a separate sibling fix
 * covers segment-body default folding that is also needed for the
 * target to flip).
 *
 * Cross-fixture validation: 4 passing fixtures with `_hf_str` patterns
 * containing parens (`(p0||p1).value`, `(p0.description??"")&&...`) were
 * checked; their parens are LOAD-BEARING (member access on grouping,
 * binary operand of higher-precedence) and parent context is NOT a
 * `Property` — they stay intact.
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

describe('_hf<n>_str paren normalization for object-property values', () => {
  it('strips parens around `??` access in object-form _hf<n>_str', () => {
    // Works's params={{some}} shape — defaulted prop in object property value.
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1+2}) => {
  return <div params={{some}}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // Object-form `_hf<n>_str` is paren-free around `??` — matches SWC.
    expect(code).toMatch(/_hf0_str\s*=\s*["']\{some:p0\.some\?\?1\+2\}["']/);
    // Negative: must NOT have inner parens around `p0.some??1+2`.
    expect(code).not.toMatch(/_hf0_str\s*=\s*["']\{some:\(p0\.some\?\?1\+2\)\}["']/);
  });

  it('keeps bare-form _hf<n>_str unchanged (was already correct)', () => {
    // Bare-form benefits from the ParenthesizedExpression unwrap; this
    // pin ensures the paren-strip didn't inadvertently change it.
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
    expect(code).toMatch(/_hf0_str\s*=\s*["']p0\.some\?\?1\+2["']/);
  });

  it('preserves load-bearing parens in non-Property positions', () => {
    // Counter-test: `(a || b).value` — parens around `||` are LOAD-BEARING
    // because the parent is MemberExpression (not Property). The strip
    // helper must NOT remove them.
    const input = `
import { component$, useStore } from '@qwik.dev/core';
export const C = component$(() => {
  const a = useStore({ value: 'a' });
  const b = useStore({ value: 'b' });
  return <div title={(a || b).value}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // Some `_hf<n>_str` should contain `(p0||p1).value` — parens preserved.
    expect(code).toMatch(/_hf\d+_str\s*=\s*["'].*\(p0\|\|p1\)\.value/);
  });

  it('strips parens only at direct Property-value position (not transitively)', () => {
    // Deep nesting: object containing object containing `(_rawProps.X ?? d)`
    // The INNER paren should be stripped (it's a Property value at its
    // immediate parent). The OUTER object wraps another object — not
    // ParenthesizedExpression at all.
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1+2}) => {
  return <div data={{ outer: { inner: some } }}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // No `(p0.some??1+2)` paren-wrapped form anywhere in the hoisted strs.
    expect(code).not.toMatch(/_hf\d+_str\s*=\s*["']\S*\(p0\.some\?\?1\+2\)/);
  });
});
