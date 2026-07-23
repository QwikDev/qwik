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

    expect(code).toContain('const [propA, propB] = useLexicalScope()');
    expect(code).not.toMatch(/propA\s*=\s*_captures\[0\]/);
    expect(code).not.toMatch(/propB\s*=\s*_captures\[1\]/);
    expect(code).not.toContain('import { _captures }');
  });

  it('STILL injects _captures unpacking on regular $() captures under inline strategy', () => {
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

    expect(code).toContain('_captures[0]');
  });
});

describe('Fix B: jsx(...) → _jsxSorted(...) rewrite under inline strategy', () => {
  it('rewrites peer-tool jsx() calls inside .s(body) to _jsxSorted(...) form', () => {
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

    expect(code).toMatch(/_jsxSorted\(Fragment/);
    expect(code).toContain('_jsxSorted');
    expect(code).not.toMatch(/\bjsx\(Fragment\b/);
  });
});

describe('Fix C: sCall placement when no Qrl-form export anchor exists', () => {
  it('inserts sCalls after the last module decl any sCall body references', () => {
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

    const sCallMatches = [...code.matchAll(/q_\w+\.s\(/g)];
    expect(sCallMatches.length).toBeGreaterThanOrEqual(2);
    const firstSCallPos = sCallMatches[0].index!;
    const exportPos = code.indexOf('export { makeIt');
    expect(exportPos).toBeGreaterThan(-1);
    expect(firstSCallPos).toBeLessThan(exportPos);
    const helperDeclPos = code.indexOf('const helper');
    expect(helperDeclPos).toBeGreaterThan(-1);
    expect(firstSCallPos).toBeGreaterThan(helperDeclPos);
  });
});

describe('Fix D: _auto_ reexport for module decl used inside inlinedQrl body under inline', () => {
  it('emits export { name as _auto_name } when an inlinedQrl body uses a module-level decl', () => {
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

    expect(code).toMatch(/export\s*\{\s*shared\s+as\s+_auto_shared\s*\}/);
  });

  it('does NOT emit move-style deletion for a single-segment decl under inline', () => {
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

    expect(code).toMatch(/const\s+solo\s*=/);
    expect(code).toMatch(/solo\(\)/);
  });
});

describe('inline strategy: top-level module-scope refs are not captured', () => {
  it('references a module-level decl directly instead of serializing it as a capture', () => {
    const input = `
import { server$ } from '@qwik.dev/router';
import { makeCache } from 'some-lib';

const cache = makeCache();

export const fn = server$(async () => {
  return cache.get('x');
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'hoist' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/const\s+cache\s*=\s*makeCache\(\)/);
    expect(code).toMatch(/cache\.get\(/);
    expect(code).not.toMatch(/\.w\(\[\s*cache/);
    expect(code).not.toMatch(/cache\s*=\s*_captures\[/);
  });
});
