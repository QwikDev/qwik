/**
 * Regression tests for segment-body constant folding for
 * `?? <const-expr>` defaults injected by raw-props consolidation.
 *
 * Pre-fix bug: `replacePropsFieldReferencesInBody` /
 * `replacePropsFieldReferences` emit `(_rawProps.X ?? <default-src>)` in
 * segment + parent bodies where the destructure had a default (e.g.
 * `({some = 1+2})`). The `<default-src>` is verbatim source text. SWC's
 * `simplify::simplifier` pass folds constant-foldable subtrees in the
 * body context (`?? 1+2` → `?? 3`), while keeping `_hf<n>_str`
 * source-preserving (no fold) because `_str` is the literal source slice
 * the runtime ships to clients. Lambda-body (`_hf<n>` arrow) folding
 * already existed, but the segment-body source had none.
 *
 * Fix: new `foldBodySimplifiableExpressions` helper in `utils/simplify.ts`
 * runs as a post-JSX-transform pass over the body text. Reuses the
 * `collectSimplifications` + `applyReplacements` primitives extracted
 * from `signal-analysis.ts`. Conservative
 * — only folds non-Literal subtrees (Binary/Unary/Logical/Conditional
 * with primitive-literal operands); source-form literal strings stay
 * as-written via `bodySourceSimplificationsCollector` (a dedicated
 * factory — formerly a `skipLiterals: true` option — paired with
 * `lambdaBodySimplificationsCollector` for the signal-analysis
 * call site that DOES want the canonical quote rewrite).
 * Architectural timing — runs AFTER JSX transform completes so
 * `_hf<n>_str` has already been generated from the source-form
 * positions; remaining `?? <default>` patterns live only in non-JSX
 * positions like `console.log(_rawProps.X ?? 1+2)`.
 *
 * Companion to convergence's `example_props_optimization` (the final
 * blocker for the test to flip from failing).
 *
 * Cross-fixture validation pre-impl: surveyed all `??` patterns in
 * passing snaps — `issue_33443` (`?? ''` literal, no-op), `qwik_router_client`
 * (`?? 'http://...'` literal, no-op; `?? identifier` / `?? {}` etc.,
 * non-foldable). Narrow gate confirmed safe.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';
import {
  foldBodySimplifiableExpressions,
} from '../../../src/optimizer/jsx/simplify.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('segment-body default folding (post-JSX-transform pass)', () => {
  it('folds `?? 1+2` → `?? 3` in component body where raw-props injected the default', () => {
    // Works's component body: `console.log(hey, some)` where `some = 1+2`
    // has been destructured-then-consolidated to `_rawProps.some`.
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({stuff: hey, some = 1+2}) => {
  console.log(hey, some);
  return <div some={some}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // Folded form in console.log: `_rawProps.some ?? 3` (NOT `?? 1+2`).
    expect(code).toMatch(/console\.log\([^)]*_rawProps\.some\s*\?\?\s*3/);
    // Make sure the unfolded form is NOT present in the body.
    expect(code).not.toMatch(/console\.log\([^)]*_rawProps\.some\s*\?\?\s*1\s*\+\s*2/);
  });

  it('folds `?? 1+2` in nested useTask body too', () => {
    // Mirrors Works's useTask$ — references to defaulted parent locals
    // should have the default folded in the nested body.
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';
export const C = component$(({count, some = 1+2}) => {
  useTask$(({track}) => {
    track(() => count);
    console.log(count, some);
  });
  return <div class={count}>{count}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // useTask body: `console.log(... _rawProps.some ?? 3 ...)`
    expect(code).toMatch(/_rawProps\.some\s*\?\?\s*3/);
    // Pre-fix bug form must not appear in body emit.
    expect(code).not.toMatch(/_rawProps\.some\s*\?\?\s*1\s*\+\s*2/);
  });

  it('keeps `_hf<n>_str` source-preserving (the architectural conflict the post-pass timing resolves)', () => {
    // The same `1+2` source position feeds both:
    //   1. Body emit (needs folded `?? 3`)
    //   2. `_hf<n>_str` (needs source-preserving `??1+2`)
    // Post-JSX-transform timing for the fold pass means `_hf<n>_str`
    // has already been generated source-preserving before the fold
    // touches the remaining non-JSX body positions.
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1+2}) => {
  console.log(some);
  return <div some={some} params={{some}}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // `_hf<n>_str` stays source-preserving — the literal `1+2` survives.
    // Bare form: `"p0.some??1+2"`. Object form: `"{some:p0.some??1+2}"`.
    expect(code).toMatch(/"p0\.some\?\?1\+2"/);
    expect(code).toMatch(/"\{some:p0\.some\?\?1\+2\}"/);
    // But the lambda body (`_hf<n> = ...`) is folded — pre-existing behavior.
    expect(code).toMatch(/_hf0\s*=\s*\(p0\)\s*=>\s*p0\.some\s*\?\?\s*3/);
    // And the console.log body emit is folded — the behavior under test.
    // (`applyIdentifierReplacements` defensively wraps the access in parens
    // — `console.log((_rawProps.some ?? 3))` — and the paren-strip
    // only fires in object-property-value position; outer parens at
    // call-argument position stay.)
    expect(code).toMatch(/console\.log\(\(?_rawProps\.some\s*\?\?\s*3\)?/);
  });

  it('leaves non-foldable `?? <expr>` RHS untouched (negative-scope)', () => {
    // `?? identifier`, `?? {}`, `?? Math.random()` — all non-foldable
    // per `simplifyExpression` rules; the pass must not touch them.
    const input = `
import { component$ } from '@qwik.dev/core';
const SENTINEL = 42;
export const C = component$(({val = SENTINEL}) => {
  console.log(val);
  return <div/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // Default identifier `SENTINEL` is non-foldable — stays as-written.
    expect(code).toMatch(/_rawProps\.val\s*\?\?\s*SENTINEL/);
    // And `SENTINEL = 42` declaration is preserved (not constant-propagated
    // into the body by THIS pass — the const-prop concern is separate).
    expect(code).toMatch(/SENTINEL\s*=\s*42/);
  });

  it('does NOT re-canonicalize existing string literals (skipLiterals: true)', () => {
    // Test name preserved per REGRESSION.md's "renamed tests count as
    // missing" caveat; the original `skipLiterals: true` option was
    // replaced by the `bodySourceSimplificationsCollector` factory
    // but the test's INTENT is unchanged: source literals must
    // be preserved verbatim.
    //
    // The body-fold pass uses `bodySourceSimplificationsCollector`
    // because the source's literal nodes are already in canonical form.
    // Re-formatting via `formatSimplifiedLiteral` would rewrite `"foo"`
    // to `'foo'` — that's what `lambdaBodySimplificationsCollector`
    // does for the lambda-body emit (intentional, matches SWC's
    // canonical form), but NOT what we want in the body-source
    // pass where it would unnecessarily churn existing source.
    const before = `(_rawProps) => {
  console.log("count", "div", "click");
  return _jsxSorted("div", null, null, "hello", 3, "u6_0");
}`;
    const after = foldBodySimplifiableExpressions(before);
    // Double-quoted literals from source MUST be preserved verbatim.
    expect(after).toContain('"count"');
    expect(after).toContain('"div"');
    expect(after).toContain('"click"');
    expect(after).toContain('"hello"');
    expect(after).toContain('"u6_0"');
    // No accidental single-quote canonicalization.
    expect(after).not.toContain("'count'");
    expect(after).not.toContain("'div'");
  });

  it('folds bare nested expressions outside any `??` (general SWC simplifier behavior)', () => {
    // Sanity: the helper folds ANY constant-foldable subtree, not just
    // `??` RHS. Mirrors SWC's broader simplifier semantics.
    const before = `(_rawProps) => {
  const a = 1 + 2;
  const b = !false;
  const c = true ? "yes" : "no";
  return [a, b, c];
}`;
    const after = foldBodySimplifiableExpressions(before);
    // BinaryExpression folds.
    expect(after).toMatch(/const a = 3\b/);
    // UnaryExpression folds.
    expect(after).toMatch(/const b = true\b/);
    // ConditionalExpression with literal test folds (its branch result is
    // a string literal that was emitted with double quotes from source —
    // `bodySourceSimplificationsCollector` leaves Literal nodes alone,
    // but the ConditionalExpression itself isn't a Literal so it folds
    // and the result IS produced via formatSimplifiedLiteral which uses
    // single quotes).
    expect(after).toMatch(/const c = 'yes'/);
  });
});
