/**
 * Regression tests for OSS-408 — peer-tool `inlinedQrl(...)` re-emission
 * + signal-analysis in jsx() call rewriting + JSX flag classification.
 *
 * Pickup audit found 5 root causes for `example_parsed_inlined_qrls`
 * (Inline + Prod, idempotency case). PR #138 had already wired the basic
 * `q_X.s(body)` re-emission; this PR adds:
 *
 *   A. Prod-mode rename for `inlinedQrl` extractions. Previously skipped on
 *      the grounds that "name was set explicitly by the upstream tool" —
 *      but SWC ALSO renames under prod (`s_<hash>` form, hash preserved).
 *      Skipping was a parity gap; runtime uses hash-keyed lookup.
 *   B. Skip `disambiguateExtractions` for `inlinedQrl`. Peer-tool-supplied
 *      names are unique by construction (the tool already disambiguates);
 *      appending `_<n>` rewrites a name the consumer expects and breaks
 *      the prod-rename hash math.
 *   C. Reactive-binding wrapProp inside jsx() calls. `const X = useStore()`
 *      / `useSignal()` etc. bindings get tracked; their field accesses
 *      INSIDE jsx() call argument trees (children + var-prop values) get
 *      rewritten to `_wrapProp(X, "field")`. Scope-aware — skips function
 *      boundaries (arrow bodies, inlinedQrl callbacks) so closure-internal
 *      `X.field` accesses stay raw.
 *   D. Nested-jsx key behaviour. SWC's `handle_jsx`: nested jsx() calls
 *      under an HTML-tag parent get `null` for the key arg (only the
 *      outermost HTML call keys); nested calls under COMPONENT-tag parents
 *      keep auto-keys (cf. OSS-405's qwik_react_inline fixture).
 *   E. JSX flag classification updates: `_wrapProp(...)` and reactive
 *      `obj.prop` children count as static (cascade of C); event-handler
 *      props with dynamic values (the typical `q_X.w([...])` peer-tool
 *      form) set `hasVarEventHandler`, dropping the static_listeners bit.
 *
 * Plus the event-handler key rewrite for HTML jsx() calls (`onClick$` →
 * `"q-e:click"`), which surfaced as a coupled secondary symptom.
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

describe('OSS-408 Fix A: prod-mode rename applied to inlinedQrl extractions', () => {
  it('renames peer-tool `inlinedQrl(body, "App_x_Y", [])` symbol to `s_Y` form under prod', () => {
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';
export const App = /*#__PURE__*/ componentQrl(inlinedQrl(() => 1, "App_component_Fh88JClhbC0"));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
      mode: 'prod',
    });

    const code = findParent(result).code;
    // (A.1) Renamed to `s_<hash>` form, preserving the hash suffix.
    expect(code).toMatch(/q_s_Fh88JClhbC0\.s\(/);
    expect(code).toMatch(/_noopQrl\("s_Fh88JClhbC0"\)/);
    // (A.2) Original peer-tool name no longer appears as a QRL var.
    expect(code).not.toMatch(/q_App_component_Fh88JClhbC0/);
  });

  it('does NOT rename under dev mode', () => {
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';
export const App = /*#__PURE__*/ componentQrl(inlinedQrl(() => 1, "App_component_Fh88JClhbC0"));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
      mode: 'dev',
    });

    const code = findParent(result).code;
    // Dev mode preserves the original name.
    expect(code).toMatch(/q_App_component_Fh88JClhbC0/);
  });
});

describe('OSS-408 Fix B: skip disambiguation for inlinedQrl extractions', () => {
  it('preserves two peer-tool-supplied names that share a context prefix', () => {
    // Both inlinedQrls share the `STYLES_` context portion; the per-tool
    // suffix (`odz7dfdfdM`/`odzdfdfdM`, both 10+ alphanumeric — passes the
    // 8+-char hash gate at `extract.ts:630`) makes them unique. The bug
    // pre-fix: `disambiguateExtractions` saw matching context portions
    // (both `STYLES`) and appended `_1` to the second, rewriting its name
    // and breaking the consumer-expected identity.
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';
export const App = /*#__PURE__*/ componentQrl(inlinedQrl(() => {
  useStyles$(inlinedQrl(STYLES, "STYLES_odz7dfdfdM"));
  useStyles$(inlinedQrl(STYLES, "STYLES_odzdfdfdM"));
}, "App_outer_Fh88JClhbC0"));
export const STYLES = '.red {}';
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
      mode: 'prod',
    });
    const code = findParent(result).code;
    // Both names preserved (just prod-renamed to `s_<hash>` form — the hash
    // is the post-`_` suffix; the `STYLES_` context portion drops away).
    expect(code).toMatch(/q_s_odz7dfdfdM\b/);
    expect(code).toMatch(/q_s_odzdfdfdM\b/);
    // No `_1` disambiguation suffix appended to either.
    expect(code).not.toMatch(/q_s_1_/);
  });
});

describe('OSS-408 Fix C: _wrapProp for reactive field access in jsx() children', () => {
  it('rewrites `store.count` to `_wrapProp(store, "count")` inside jsx() children', () => {
    const input = `
import { componentQrl, inlinedQrl, useStore, jsx } from '@qwik.dev/core';
export const App = /*#__PURE__*/ componentQrl(inlinedQrl(() => {
  const store = useStore({ count: 0 });
  return /*#__PURE__*/ jsx("div", { children: store.count });
}, "App_outer_xxx"));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
      mode: 'prod',
    });
    const code = findParent(result).code;
    expect(code).toMatch(/_wrapProp\(store,\s*"count"\)/);
  });

  it('does NOT wrap `obj.prop` inside nested function scopes (closure boundary)', () => {
    // The onClick handler's body reads `store.count` via useLexicalScope —
    // a separate scope. Even though the OUTER jsx() call's argument tree
    // contains this expression textually, signal-wrapping must stop at
    // function boundaries (arrow, inlinedQrl callback).
    const input = `
import { componentQrl, inlinedQrl, useStore, useLexicalScope, jsx } from '@qwik.dev/core';
export const App = /*#__PURE__*/ componentQrl(inlinedQrl(() => {
  const store = useStore({ count: 0 });
  return /*#__PURE__*/ jsx("button", {
    onClick$: inlinedQrl(() => {
      const [store] = useLexicalScope();
      return store.count++;
    }, "Inner_aaa", [store]),
    children: "Click",
  });
}, "App_outer_xxx"));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
      mode: 'prod',
    });
    const code = findParent(result).code;
    // Inner body's `store.count++` stays raw — the wrap would corrupt the
    // increment expression (`_wrapProp(...)++` is invalid).
    expect(code).toMatch(/store\.count\+\+/);
    expect(code).not.toMatch(/_wrapProp\(store,\s*"count"\)\+\+/);
  });
});

describe('OSS-408 Fix D: nested-jsx auto-key behaviour by parent tag kind', () => {
  it('emits `null` key for jsx() calls nested under HTML-tag parents', () => {
    // `<div><p>...</p></div>` form: only the outermost div gets an auto-key.
    const input = `
import { componentQrl, inlinedQrl, jsx } from '@qwik.dev/core';
export const App = /*#__PURE__*/ componentQrl(inlinedQrl(() => {
  return /*#__PURE__*/ jsx("div", { children: /*#__PURE__*/ jsx("p", { children: "hi" }) });
}, "App_outer_xxx"));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
      mode: 'prod',
    });
    const code = findParent(result).code;
    // Outer div has an auto-key (string-literal arg6).
    expect(code).toMatch(/_jsxSorted\("div",.*"u6_0"\)/s);
    // Inner p has null key (no auto-generated string).
    const pCall = code.match(/_jsxSorted\("p",.*?null\)/s);
    expect(pCall).not.toBeNull();
  });

  it('keeps auto-keys on nested jsx() calls under COMPONENT-tag parents', () => {
    // Component-tag jsx() calls (identifier tag arg) auto-key all the way
    // down — matches OSS-405's `qwik_react_inline` shape with Host /
    // SkipRerender / Fragment nesting.
    const input = `
import { componentQrl, inlinedQrl, jsx } from '@qwik.dev/core';
export const App = /*#__PURE__*/ componentQrl(inlinedQrl(() => {
  return /*#__PURE__*/ jsx(Host, { children: /*#__PURE__*/ jsx(SkipRerender, {}) });
}, "App_outer_xxx"));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
      mode: 'prod',
    });
    const code = findParent(result).code;
    // Both calls keyed (no `null` for either; both get auto-generated
    // `"u6_<n>"` strings as the 6th _jsxSorted arg).
    expect(code).toMatch(/"u6_0"/);
    expect(code).toMatch(/"u6_1"/);
    // Component-tag jsx() calls do NOT get the HTML nesting null-key
    // treatment; both Host and SkipRerender are present with keys.
    expect(code).toMatch(/_jsxSorted\(Host,/);
    expect(code).toMatch(/_jsxSorted\(SkipRerender,/);
  });
});

describe('OSS-408 event-handler key rewrite for HTML tags', () => {
  it('rewrites `onClick$` to `"q-e:click"` in jsx() calls on HTML elements', () => {
    const input = `
import { componentQrl, inlinedQrl, jsx } from '@qwik.dev/core';
export const App = /*#__PURE__*/ componentQrl(inlinedQrl(() => {
  return /*#__PURE__*/ jsx("button", {
    onClick$: inlinedQrl(() => 1, "Click_aaa"),
    children: "Click",
  });
}, "App_outer_xxx"));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
      mode: 'prod',
    });
    const code = findParent(result).code;
    // Key renamed.
    expect(code).toMatch(/"q-e:click":/);
    // Original `onClick$` no longer appears as the prop key (may still
    // appear as a substring elsewhere — anchor on the colon to be specific).
    expect(code).not.toMatch(/\bonClick\$:/);
  });
});
