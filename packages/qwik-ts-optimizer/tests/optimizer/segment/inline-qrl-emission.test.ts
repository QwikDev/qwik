/**
 * Regression tests for peer-tool `inlinedQrl(...)` re-emission
 * under Inline entry strategy.
 *
 * The pickup audit surfaced four distinct root causes (see PR description /
 * STATE.md entry). Each test below pins one fix; they were coupled enough
 * that the convergence target (`example_qwik_react_inline`) only flipped
 * once all four landed:
 *
 *   A. `_captures` unpacking was injected on `inlinedQrl` bodies that
 *      already destructure via `useLexicalScope()`. Fix: gate the injection
 *      on `!ext.isInlinedQrl` (`rewrite/inline-body.ts`), mirroring the
 *      existing `skipCaptureInjection` flag used by the segment-file path.
 *   B. `jsx(Tag, propsObj)` peer-tool call sites inside `.s(body)` blocks
 *      weren't rewritten to `_jsxSorted(...)`. Fix: run `transformJsxCalls`
 *      on the inline-strategy body (parallel to Phase 5b in segment-codegen).
 *   C. sCalls landed at the end of the file when no `Qrl(`-form export
 *      anchor existed. Fix: when the anchor lookup fails, fall back
 *      to inserting sCalls after the last module decl any sCall body
 *      references — produces the correct independent-statement block
 *      partition for compareAst.
 *   D. `_auto_<name>` re-exports for module decls used inside `inlinedQrl`
 *      bodies were missing because migration was skipped wholesale under
 *      inline strategy. Fix: run migration and keep only `reexport`
 *      decisions (`move` would delete decls the in-parent body still
 *      references).
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

describe('Fix A: skip _captures injection on inlinedQrl bodies under inline', () => {
  it('does NOT inject _captures unpacking when body destructures via useLexicalScope()', () => {
    // Peer-tool input: `inlinedQrl(fn, name, [captures])` with explicit
    // `useLexicalScope()` destructuring inside the fn body. Under inline
    // strategy, the body re-emits verbatim inside `.s(body)` — adding
    // `const a = _captures[0], b = _captures[1]` on top would produce
    // duplicate-destructuring semantics (same name bound twice in the
    // same scope) and ship a redundant `_captures` import.
    const input = `
import { componentQrl, inlinedQrl, useLexicalScope } from '@qwik.dev/core';

function makeIt(propA, propB) {
  return /*#__PURE__*/ componentQrl(inlinedQrl((track) => {
    const [propA, propB] = useLexicalScope();
    track(propA);
    return propB;
  }, "demo_inlined_xYz", [propA, propB]));
}
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.mjs'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const parent = findParent(result);
    const code = parent.code;

    // (A.1) `useLexicalScope()` destructuring preserved verbatim.
    expect(code).toContain('const [propA, propB] = useLexicalScope()');
    // (A.2) NO injected `const X = _captures[0]` unpacking.
    expect(code).not.toMatch(/propA\s*=\s*_captures\[0\]/);
    expect(code).not.toMatch(/propB\s*=\s*_captures\[1\]/);
    // (A.3) NO redundant `_captures` import (cascades from A.2).
    expect(code).not.toContain('import { _captures }');
  });

  it('STILL injects _captures unpacking on regular $() captures under inline strategy', () => {
    // Negative scope check: the fix narrows on `ext.isInlinedQrl` only.
    // Regular `$()` extractions whose captures route through the capture-
    // promotion pipeline must continue to get `_captures[N]` /
    // `_rawProps.X` injection under inline strategy — the inlinedQrl
    // gate must not regress that path.
    //
    // Shape mirrors an `example_optimization_issue_3542`-style
    // fixture: component with destructured props + nested handler.
    const input = `
import { component$ } from '@qwik.dev/core';

export const Foo = component$(({ ctx, atom }) => {
  return (
    <span onClick$={(ev) => doIt(ctx, ev, [atom])}>
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

    // Regular `$()`-path body still gets `_captures[0]` unpacking
    // (proves the inlinedQrl gate didn't accidentally short-circuit
    // the non-inlinedQrl injection path).
    expect(code).toContain('_captures[0]');
  });
});

describe('Fix B: jsx(...) → _jsxSorted(...) rewrite under inline strategy', () => {
  it('rewrites peer-tool jsx() calls inside .s(body) to _jsxSorted(...) form', () => {
    // qwik-react codegen emits `jsx(Tag, propsObj)` rather than JSX syntax.
    // Under inline strategy the body stays in the parent module (not a
    // segment file), so the Phase-5b jsx-call rewrite in segment-codegen
    // never sees it. The fix wires the same transform into the inline
    // body path.
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';
import { jsx, Fragment } from '@qwik.dev/core/jsx-runtime';

function makeIt() {
  return /*#__PURE__*/ componentQrl(inlinedQrl(() => {
    return /*#__PURE__*/ jsx(Fragment, { children: 'hi' });
  }, "demo_jsx_aBc"));
}
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.mjs'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const parent = findParent(result);
    const code = parent.code;

    // (B.1) `jsx(...)` call rewritten to `_jsxSorted(...)`.
    expect(code).toMatch(/_jsxSorted\(Fragment/);
    // (B.2) `_jsxSorted` import added.
    expect(code).toContain('_jsxSorted');
    // (B.3) Original `jsx(` call site is gone from the body. (`jsx`
    // may still appear in the input-echo section of the snap header,
    // so anchor on `jsx(Fragment` specifically — only the call form.)
    expect(code).not.toMatch(/\bjsx\(Fragment\b/);
  });
});

describe('Fix C: sCall placement when no Qrl-form export anchor exists', () => {
  it('inserts sCalls after the last module decl any sCall body references', () => {
    // The F1c emit-ordering logic anchors sCalls relative to the LAST `Qrl(`-form
    // export line. Peer-tool inlinedQrl input often has no such export
    // (the binding is exported via `export { name }`, not
    // `export const name = componentQrl(...)`). Pre-fix, sCalls fell
    // through to `lines.push(...sCalls)` — they landed AFTER the export
    // statement, producing one big independent-statement block instead
    // of the expected two blocks (sCalls between non-independent decls,
    // exports at the end). compareAst's contiguous-block sort can't
    // collapse the two cases together, so the structural partition
    // matters.
    const input = `
import { componentQrl, inlinedQrl, useTaskQrl } from '@qwik.dev/core';

function makeIt(dep) {
  return /*#__PURE__*/ componentQrl(inlinedQrl(() => {
    useTaskQrl(inlinedQrl(() => helper(dep), "inner_aaa", [dep]));
  }, "outer_bbb", [dep]));
}
const helper = (x) => x * 2;
const wrap = (it) => it;

export { makeIt, wrap };
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.mjs'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const parent = findParent(result);
    const code = parent.code;

    // (C.1) Two sCalls exist (one per inlinedQrl). Names are prod-renamed
    // (`q_s_<hash>` form), so match by structure rather than
    // by the source peer-tool name.
    const sCallMatches = [...code.matchAll(/q_\w+\.s\(/g)];
    expect(sCallMatches.length).toBeGreaterThanOrEqual(2);
    const firstSCallPos = sCallMatches[0].index!;
    // (C.2) sCalls come BEFORE the `export { makeIt, wrap }` line. Find
    // both positions and assert ordering; the structural partitioning
    // is what gates the convergence test.
    const exportPos = code.indexOf('export { makeIt');
    expect(exportPos).toBeGreaterThan(-1);
    expect(firstSCallPos).toBeLessThan(exportPos);
    // (C.3) sCalls come AFTER `helper` decl (which they reference).
    const helperDeclPos = code.indexOf('const helper');
    expect(helperDeclPos).toBeGreaterThan(-1);
    expect(firstSCallPos).toBeGreaterThan(helperDeclPos);
  });
});

describe('Fix D: _auto_ reexport for module decl used inside inlinedQrl body under inline', () => {
  it('emits export { name as _auto_name } when an inlinedQrl body uses a module-level decl', () => {
    // Pre-fix, `migrationDecisions` was hard-coded to `[]` under inline /
    // hoist strategy. That suppressed the MIG-02 (multi-segment) /
    // MIG-03 (exported) `reexport` decisions that SWC emits — even though
    // under inline strategy the body stays in the parent and the reexport
    // is redundant for runtime, the snapshot oracle expects it.
    //
    // Fix runs migration normally and filters out `move` decisions
    // (which would delete decls still referenced by the in-parent body).
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';
import { jsx } from '@qwik.dev/core/jsx-runtime';

function makeIt() {
  return /*#__PURE__*/ componentQrl(inlinedQrl(() => {
    return /*#__PURE__*/ jsx('div', { children: shared('a') });
  }, "outerA_aaa"));
}
function makeIt2() {
  return /*#__PURE__*/ componentQrl(inlinedQrl(() => {
    return /*#__PURE__*/ jsx('div', { children: shared('b') });
  }, "outerB_bbb"));
}
const shared = (x) => x.toUpperCase();

export { makeIt, makeIt2 };
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.mjs'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const parent = findParent(result);
    const code = parent.code;

    // (D.1) `shared` is referenced by both inlinedQrl bodies — MIG-02
    // emits `reexport` → `export { shared as _auto_shared }`.
    expect(code).toMatch(/export\s*\{\s*shared\s+as\s+_auto_shared\s*\}/);
  });

  it('does NOT emit move-style deletion for a single-segment decl under inline', () => {
    // Single-segment dep would default to MIG-01 `move` under the
    // segment-file strategy (the decl gets relocated into the segment
    // file). Under inline strategy the body stays in the parent — a
    // `move` would `s.remove(declStart, declEnd)` leaving a dangling
    // reference in the in-parent body. The fix's `.filter(d => d.action
    // === 'reexport')` keeps `move` decisions suppressed.
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';
import { jsx } from '@qwik.dev/core/jsx-runtime';

function makeIt() {
  return /*#__PURE__*/ componentQrl(inlinedQrl(() => {
    return /*#__PURE__*/ jsx('div', { children: solo() });
  }, "lone_aaa"));
}
const solo = () => 'x';
export { makeIt };
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.mjs'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const parent = findParent(result);
    const code = parent.code;

    // (D.2) `solo` decl is still in parent (NOT removed via `move`).
    expect(code).toMatch(/const\s+solo\s*=/);
    // (D.3) The inline body still references `solo()` directly.
    expect(code).toMatch(/solo\(\)/);
  });
});
