import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { propagateConstLiteralsInBody } from '../../../src/optimizer/rewrite/const-propagation.js';
import { transformModule } from '../../../src/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function parses(code: string): boolean {
  return (parseSync('out.tsx', code).errors ?? []).length === 0;
}

describe('propagateConstLiteralsInBody inlining a single-use member-expression const', () => {
  it('expands an object shorthand to key:value when it inlines the const', () => {
    const body = `() => { const v = obj.a.b; return f({ v }); }`;
    const out = propagateConstLiteralsInBody(body);
    expect(out).toContain('{ v: obj.a.b }');
    expect(out).not.toMatch(/\{\s*obj\.a\.b\s*\}/);
    expect(out).not.toContain('const v =');
  });

  it('leaves an already-expanded property correct', () => {
    const body = `() => { const v = obj.a.b; return f({ v: v }); }`;
    const out = propagateConstLiteralsInBody(body);
    expect(out).toContain('v: obj.a.b');
    expect(out).not.toContain('const v =');
  });

  it('does not add a key for a non-property reference', () => {
    const body = `() => { const v = obj.a.b; return g(v); }`;
    const out = propagateConstLiteralsInBody(body);
    expect(out).toContain('g(obj.a.b)');
  });
});

describe('propagateConstLiteralsInBody with a bare-identifier alias reference', () => {
  it('inlines a single-use const into a kept declarator that aliases it', () => {
    const body = `() => { const cur = obj.a.value; const start = cur; return start + start; }`;
    const out = propagateConstLiteralsInBody(body);
    expect(out).toContain('const start = obj.a.value');
    expect(out).not.toMatch(/\bcur\b/);
    expect(parses(out)).toBe(true);
  });

  it('keeps a multi-use const aliased by a bare-identifier declarator', () => {
    const body = `() => { const cur = obj.a.value; const start = cur; return start + cur; }`;
    const out = propagateConstLiteralsInBody(body);
    expect(out).toContain('const cur = obj.a.value');
    expect(parses(out)).toBe(true);
  });
});

describe('pre-transformed _jsxDEV shorthand prop survives const inlining', () => {
  function parentOf(input: string) {
    const result = transformModule({
      input: [{ path: mkFilePath('header.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'hoist' },
      minify: 'simplify',
      transpileTs: true,
      transpileJsx: false,
      isServer: true,
      mode: 'dev',
    });
    return (result.modules.find((m) => m.kind === 'parent') ?? result.modules[0]!).code;
  }

  it('expands a shorthand prop whose const is a chained member (header.tsx shape)', () => {
    const input = `
import { jsxDEV as _jsxDEV } from '@qwik.dev/core/jsx-dev-runtime';
import { component$ } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';
const Section = (p) => _jsxDEV("div", { children: 1 }, void 0, false);
export const Menu = component$(() => {
  const { url } = useLocation();
  const pathname = url.pathname;
  return _jsxDEV(Section, { section: 1, pathname }, void 0, false);
});
`;
    const code = parentOf(input);
    // Shorthand `{ …, pathname }` must keep its key when the value is inlined.
    expect(code).toContain('pathname:');
    expect(parses(code)).toBe(true);
  });

  it('produces parseable output (no dangling member in an object literal)', () => {
    const input = `
import { jsxDEV as _jsxDEV } from '@qwik.dev/core/jsx-dev-runtime';
import { component$ } from '@qwik.dev/core';
const C = (p) => _jsxDEV("div", { children: 1 }, void 0, false);
export const M = component$(() => {
  const obj = { a: { b: 1 } };
  const v = obj.a.b;
  return _jsxDEV(C, { v }, void 0, false);
});
`;
    const code = parentOf(input);
    expect(code).toContain('v: obj.a.b');
    expect(code).not.toMatch(/\{\s*obj\.a\.b\s*\}/);
    expect(parses(code)).toBe(true);
  });
});
