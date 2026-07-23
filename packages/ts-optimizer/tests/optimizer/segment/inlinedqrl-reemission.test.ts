import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('Fix A: prod-mode rename applied to inlinedQrl extractions', () => {
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
    expect(code).toMatch(/q_s_Fh88JClhbC0\.s\(/);
    expect(code).toMatch(/_noopQrl\("s_Fh88JClhbC0"\)/);
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
    expect(code).toMatch(/q_App_component_Fh88JClhbC0/);
  });
});

describe('Fix B: skip disambiguation for inlinedQrl extractions', () => {
  it('preserves two peer-tool-supplied names that share a context prefix', () => {
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
    expect(code).toMatch(/q_s_odz7dfdfdM\b/);
    expect(code).toMatch(/q_s_odzdfdfdM\b/);
    expect(code).not.toMatch(/q_s_1_/);
  });
});

describe('Fix C: _wrapProp for reactive field access in jsx() children', () => {
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
    expect(code).toMatch(/store\.count\+\+/);
    expect(code).not.toMatch(/_wrapProp\(store,\s*"count"\)\+\+/);
  });
});

describe('Fix D: nested-jsx auto-key behaviour by parent tag kind', () => {
  it('emits `null` key for jsx() calls nested under HTML-tag parents', () => {
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
    expect(code).toMatch(/_jsxSorted\("div",.*"u6_0"\)/s);
    const pCall = code.match(/_jsxSorted\("p",.*?null\)/s);
    expect(pCall).not.toBeNull();
  });

  it('keeps auto-keys on nested jsx() calls under COMPONENT-tag parents', () => {
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
    expect(code).toMatch(/"u6_0"/);
    expect(code).toMatch(/"u6_1"/);
    expect(code).toMatch(/_jsxSorted\(Host,/);
    expect(code).toMatch(/_jsxSorted\(SkipRerender,/);
  });
});

describe('event-handler key rewrite for HTML tags', () => {
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
    expect(code).toMatch(/"q-e:click":/);
    expect(code).not.toMatch(/\bonClick\$:/);
  });
});
