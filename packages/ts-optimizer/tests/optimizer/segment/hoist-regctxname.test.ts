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

    expect(code).toMatch(/q_\w+\.s\(STYLES\)/);
    expect(code).not.toMatch(/const\s+\w+\s*=\s*STYLES\s*;/);
  });

  it('still wraps non-bare-identifier bodies in the const+sCall pair', () => {
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

    expect(code).toMatch(/const\s+\w+\s*=\s*\(\{/);
    expect(code).toMatch(/q_\w+\.s\(\w+\)/);
  });
});

describe('Fix B: filter migrated names from body-side capture unpacking', () => {
  it('does NOT inject `const X = _captures[0]` for a migrated module-level decl', () => {
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

    expect(code).not.toMatch(/const\s+STYLES\s*=\s*_captures\[0\]/);
    expect(code).toMatch(/export\s*\{\s*STYLES\s+as\s+_auto_STYLES\s*\}/);
    expect(code).not.toContain('import { _captures }');
  });

  it('STILL injects `_captures[N]` for non-migrated closure captures (Inline strategy)', () => {
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

    expect(code).toContain('_captures[0]');
  });
});

describe('Fix C: per-sCall placement when sCall references a forward-declared decl', () => {
  it('places `q_X.s(STYLES)` AFTER `const STYLES = ...` to avoid TDZ', () => {
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

    const stylesDeclPos = code.search(/const\s+STYLES\s*=\s*['"]/);
    const sCallPos = code.search(/q_\w+\.s\(STYLES\)/);
    expect(stylesDeclPos).toBeGreaterThan(-1);
    expect(sCallPos).toBeGreaterThan(-1);
    expect(sCallPos).toBeGreaterThan(stylesDeclPos);
  });

  it('keeps non-forward-dep sCalls in their anchor-relative position', () => {
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

    const sCallMatches = [...code.matchAll(/q_\w+\.s\(\w+\)/g)];
    expect(sCallMatches.length).toBeGreaterThanOrEqual(1);
    const exportPos = code.search(/export\s+const\s+Foo\s*=/);
    expect(exportPos).toBeGreaterThan(-1);
    for (const m of sCallMatches) {
      expect(m.index!).toBeLessThan(exportPos);
    }
  });
});
