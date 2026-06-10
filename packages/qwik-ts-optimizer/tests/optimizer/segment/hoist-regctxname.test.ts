/**
 * Regression tests for Hoist strategy + regCtxName emission.
 *
 * Three distinct coupled bugs (the `_auto_STYLES` reexport and the
 * `.w(...)` call-site wrap were already covered by the migration
 * filter for inline/hoist).
 *
 *   A. `useStyle$(STYLES)` body is the bare identifier `STYLES`. Under
 *      Hoist, TS unconditionally wrapped in `const X = body; q_X.s(X);`
 *      pairs — gratuitous for bare identifiers. Fix routes to direct
 *      `q_X.s(IDENT)` when `IDENT` is a module-level decl.
 *   B. Phantom `const STYLES = _captures[0]` injected in the Works
 *      component body — `addCaptureWrapping` already filters migrated
 *      names before emitting `.w([...])` at the call site (so the
 *      array is empty), but `transformInlineSegmentBody.injectCapturesUnpacking`
 *      didn't mirror the filter — `_captures[0]` resolved to undefined.
 *      Fix passes `migratedNames` through and applies the symmetric filter.
 *   C. Per-sCall placement when a sCall references a decl declared *after*
 *      the marker-export anchor — TDZ at module load. Extended
 *      `placeSCalls` to detect forward-dep sCalls and place them after
 *      the referenced decl; grouped sCalls retain the existing
 *      anchor-relative placement.
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

describe('Fix A: direct emit for bare-identifier hoist body matching module-level decl', () => {
  it('emits `q_X.s(STYLES)` directly instead of the const-wrap pair', () => {
    // Shape mirrors `example_reg_ctx_name_segments_hoisted`'s useStyle$ case.
    // `useStyle$(STYLES)` body is just the identifier `STYLES`; under Hoist,
    // the const-decl wrap (`const X = STYLES; q_X.s(X);`) is pure overhead.
    const input = `
import { component$, useStyle$ } from '@qwik.dev/core';

export const Works = component$(() => {
  useStyle$(STYLES);
  return <div></div>;
});

const STYLES = '.class {}';
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

    // (A.1) Direct `q_X.s(STYLES);` emission — body passes the bare
    // `STYLES` identifier through.
    expect(code).toMatch(/q_\w+\.s\(STYLES\)/);
    // (A.2) NO wrapping const decl whose RHS is the bare `STYLES`
    // identifier (the gratuitous-wrap shape pre-fix).
    expect(code).not.toMatch(/const\s+\w+\s*=\s*STYLES\s*;/);
  });

  it('still wraps non-bare-identifier bodies in the const+sCall pair', () => {
    // Negative scope check: the direct-emit fix only applies when the body
    // is a bare identifier matching a module-level decl. Closure bodies,
    // CallExpressions, etc. continue to use the standard Hoist wrap.
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';

export const Works = component$(() => {
  useTask$(({ track }) => {
    track(() => 0);
  });
  return <div></div>;
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

    // Closure body still gets the const-wrap pair (`const <name> = ({...}) => ...`).
    expect(code).toMatch(/const\s+\w+\s*=\s*\(\{/);
    // sCall references the wrapping var (not a bare identifier).
    expect(code).toMatch(/q_\w+\.s\(\w+\)/);
  });
});

describe('Fix B: filter migrated names from body-side capture unpacking', () => {
  it('does NOT inject `const X = _captures[0]` for a migrated module-level decl', () => {
    // When migration reexports a module-level decl that segment bodies use,
    // `addCaptureWrapping` (already correct) filters that name from `.w([...])`
    // emission. The body MUST do the same — otherwise `_captures[0]` reads
    // undefined.
    const input = `
import { component$, useStyle$ } from '@qwik.dev/core';

export const Works = component$(() => {
  useStyle$(STYLES);
  return <div></div>;
});

const STYLES = '.class {}';
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

    // (B.1) NO `const STYLES = _captures[0]` injection inside the Works body.
    expect(code).not.toMatch(/const\s+STYLES\s*=\s*_captures\[0\]/);
    // (B.2) Migration emits the `_auto_` reexport (sanity check that A+B+C
    // cohabit under hoist).
    expect(code).toMatch(/export\s*\{\s*STYLES\s+as\s+_auto_STYLES\s*\}/);
    // (B.3) `_captures` import is absent (cascade from B.1).
    expect(code).not.toContain('import { _captures }');
  });

  it('STILL injects `_captures[N]` for non-migrated closure captures (Inline strategy)', () => {
    // Negative scope check: the migration filter must only suppress migrated
    // names — local closure captures (function-scoped vars passed through to
    // a nested handler) still need the `_captures[N]` unpacking machinery.
    // Inline strategy exercises the raw-props consolidation path which routes
    // captures through `_captures[N]` (vs Hoist which uses positional-param
    // padding `(_, _1, capture) => ...` — different mechanism).
    const input = `
import { component$ } from '@qwik.dev/core';

export const Foo = component$(({ atom }) => {
  return (
    <span onClick$={(ev) => doIt(atom, ev)}>
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

    // `_captures[0]` unpacking still fires for the nested onClick handler's
    // `_rawProps` capture (raw-props consolidation under inline).
    expect(code).toContain('_captures[0]');
  });
});

describe('Fix C: per-sCall placement when sCall references a forward-declared decl', () => {
  it('places `q_X.s(STYLES)` AFTER `const STYLES = ...` to avoid TDZ', () => {
    // Source has `export const Works = component$(...)` followed by
    // `const STYLES = '.class {}'`. The useStyle$ sCall references STYLES
    // which is declared AFTER the marker export. The default anchor placement
    // would put the sCall before the export (TDZ on the STYLES reference).
    const input = `
import { component$, useStyle$ } from '@qwik.dev/core';

export const Works = component$(() => {
  useStyle$(STYLES);
  return <div></div>;
});

const STYLES = '.class {}';
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

    // (C.1) `q_X.s(STYLES)` lands AFTER the `const STYLES = ...` decl.
    const stylesDeclPos = code.search(/const\s+STYLES\s*=\s*['"]/);
    const sCallPos = code.search(/q_\w+\.s\(STYLES\)/);
    expect(stylesDeclPos).toBeGreaterThan(-1);
    expect(sCallPos).toBeGreaterThan(-1);
    expect(sCallPos).toBeGreaterThan(stylesDeclPos);
  });

  it('keeps non-forward-dep sCalls in their anchor-relative position', () => {
    // Negative scope check: the forward-dep split is per-sCall and only fires
    // when the sCall references a decl declared after the marker anchor.
    // Other sCalls keep the grouped anchor-relative placement (before/after
    // export per self-ref).
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';

export const Foo = component$(() => {
  useTask$(({ track }) => track(() => 0));
  return <div></div>;
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

    // useTask body doesn't reference any module-level decl, so its sCall
    // sits before the export per the anchor-relative default.
    // Match a `q_<name>.s(<arg>);` line that's the useTask sCall (not the
    // component$ sCall — distinguish by matching the line with a single
    // identifier arg referencing the wrapping const).
    const sCallMatches = [...code.matchAll(/q_\w+\.s\(\w+\)/g)];
    expect(sCallMatches.length).toBeGreaterThanOrEqual(1);
    const exportPos = code.search(/export\s+const\s+Foo\s*=/);
    expect(exportPos).toBeGreaterThan(-1);
    // All sCalls land before the export (none have forward-dep on a
    // module-level decl in this fixture).
    for (const m of sCallMatches) {
      expect(m.index!).toBeLessThan(exportPos);
    }
  });
});
