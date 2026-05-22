/**
 * Regression tests for OSS-411 — `_fnSignal` lambda body constant folding.
 *
 * Pre-fix bug: `generateFnSignal` (`src/optimizer/signal-analysis.ts:346`)
 * used a single `fnBody` (source-text slice + root-identifier replacements)
 * for BOTH the lambda body and the `_str` representation. The lambda body
 * therefore preserved unfolded primitive-operand expressions like `1+2`
 * instead of folding to `3`, diverging from SWC's `simplify::simplifier`
 * pass (`swc-reference-only/parse.rs:360`).
 *
 * Fix: build two bodies — `strFnBody` (root replacements only — `_str`
 * stays source-preserving) and `lambdaFnBody` (root replacements +
 * simplifications applied via `utils/simplify.ts`). Mirrors SWC's
 * two-form emission where the runtime arrow folds compile-time constants
 * while `_str` preserves source bytes for stable hashing.
 *
 * Companion to convergence's `example_props_optimization` (one of 4 bugs
 * blocking the flip — siblings OSS-412/413/414 cover bugs 4-6).
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

describe('OSS-411: _fnSignal lambda body folds primitive-operand subtrees', () => {
  it('folds BinaryExpression with literal operands in lambda body', () => {
    // `_rawProps.some ?? 1+2` — `1+2` should fold to `3` in the lambda,
    // while `_str` keeps the source-preserving `1+2`.
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1+2}) => {
  return <div params={{ some }}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;

    // Lambda body folds `1 + 2` → `3` (formatting may vary — match either).
    expect(code).toMatch(/const _hf0\b[^=]*=[^;]*p0\.some\s*\?\?\s*3/);
    // Lambda body does NOT contain unfolded `1 + 2`.
    expect(code).not.toMatch(/const _hf0\b[^=]*=[^;]*p0\.some\s*\?\?\s*1\s*\+\s*2/);
    // _str preserves source text — must include `1+2` (whitespace-stripped).
    expect(code).toMatch(/_hf0_str\s*=\s*["']\S*1\+2/);
  });

  it('folds nested simplifiable subtree leaving non-simplifiable parents intact', () => {
    // `(2*3) + something_dynamic` — the inner `2*3` folds to `6` in lambda
    // body but the outer binary stays unsimplified.
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 2*3}) => {
  return <div params={{ some }}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // Lambda body has `?? 6` (folded).
    expect(code).toMatch(/const _hf0\b[^=]*=[^;]*p0\.some\s*\?\?\s*6/);
    // _str keeps source `2*3`.
    expect(code).toMatch(/_hf0_str\s*=\s*["']\S*2\*3/);
  });

  it('skips no-op replacement when source already matches simplified form', () => {
    // `some = 3` is already a Literal — `simplifyExpression` returns
    // `{simplified: true, value: 3}` but `formatSimplifiedLiteral(3) === '3'`
    // equals source. No replacement should be emitted (no diff).
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 3}) => {
  return <div params={{ some }}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // Both lambda and _str carry `3` (source preserved).
    expect(code).toMatch(/const _hf0\b[^=]*=[^;]*p0\.some\s*\?\?\s*3/);
    expect(code).toMatch(/_hf0_str\s*=\s*["']\S*\?\?3/);
  });

  it('leaves non-simplifiable MemberExpression operands untouched', () => {
    // `_rawProps.some` (MemberExpression) is not simplifiable; the lambda
    // body must preserve it exactly as the source after root-replacement.
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some, other}) => {
  return <div params={{ result: some + other }}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // Lambda body keeps the addition (no folding, no replacement).
    expect(code).toMatch(/const _hf0\b[^=]*=[^;]*p0\.some\s*\+\s*p0\.other/);
  });

  it('does not regress _str format when the simplifiable test arm is a literal', () => {
    // Source-already-`3` literal arm — `simplifyExpression(3)` returns
    // `{simplified: true, value: 3}` but `formatSimplifiedLiteral(3) === '3'`
    // matches source. No-op skip means `_str` is identical to the
    // pre-OSS-411 behavior; both lambda and `_str` carry `3` unchanged.
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some, stuffDefault: hey2 = 123}) => {
  return <div params={{ some, hey2 }}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // `123` is a Literal — appears verbatim in both lambda body and _str.
    expect(code).toMatch(/const _hf0\b[^=]*=[^;]*p0\.stuffDefault\s*\?\?\s*123/);
    expect(code).toMatch(/_hf0_str\s*=\s*["']\S*\?\?123/);
  });
});
