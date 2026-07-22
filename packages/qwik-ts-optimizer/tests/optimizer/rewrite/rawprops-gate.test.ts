import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

function expectAllModulesParse(result: { modules: readonly TransformModule[] }): void {
  for (const m of result.modules) {
    const parsed = parseSync('m.jsx', m.code, { lang: 'jsx' });
    expect(parsed.errors, `module ${m.path} must parse:\n${m.code}`).toHaveLength(0);
  }
}

describe('bug 1: consolidation gate preserves unsafe destructures', () => {
  it('preserves nested ObjectPattern field (NoWorks2 shape)', () => {
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';

export const C = component$(({count, stuff: {hey}}) => {
  console.log(hey);
  useTask$(({track}) => {
    track(() => count);
    console.log(count);
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

    expect(code).toMatch(/\(\{\s*count,\s*stuff:\s*\{\s*hey\s*\}\s*\}\)\s*=>/);
    expect(code).not.toMatch(/\(_rawProps\)\s*=>/);
    expect(code).toContain('console.log(hey)');
    expect(code).toMatch(/\.w\(\[\s*count\s*\]\)/);
  });

  it('preserves call-expression default (NoWorks3 shape)', () => {
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';
import { hola } from 'some-lib';

export const C = component$(({count, stuff = hola()}) => {
  console.log(stuff);
  useTask$(({track}) => {
    track(() => count);
    console.log(count);
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

    expect(code).toMatch(/\(\{\s*count,\s*stuff\s*=\s*hola\(\)\s*\}\)\s*=>/);
    expect(code).not.toMatch(/\(_rawProps\)\s*=>/);
    expect(code).toContain('console.log(stuff)');
    expect(code).toMatch(/\.w\(\[\s*count\s*\]\)/);
  });

  it('preserves a default that references a sibling binding (no dangling ref)', () => {
    const input = `
import { component$, useVisibleTask$ } from '@qwik.dev/core';

export const C = component$(({ prefetch: prefetchProp, data: dataProp = prefetchProp === "js" ? "off" : "intent" }) => {
  useVisibleTask$(() => {
    console.log(prefetchProp, dataProp);
  });
  return <div>{dataProp}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).not.toMatch(/\(_rawProps\)\s*=>/);
    expect(code).toMatch(/prefetch:\s*prefetchProp/);
    expect(code).not.toMatch(/props\.data\s*\?\?\s*prefetchProp/);
    expectAllModulesParse(result);
  });

  it('preserves a member-access default (non-const)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
import { config } from './config';

export const C = component$(({ mode = config.mode }) => {
  return <div>{mode}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).not.toMatch(/\(_rawProps\)\s*=>/);
    expect(code).toMatch(/mode\s*=\s*config\.mode/);
  });

  it('still consolidates flat destructure with const defaults (parity-safe)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';

export const C = component$(({count, some = 1+2}) => {
  return <div>{count}{some}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/\(_rawProps\)\s*=>/);
    expect(code).toMatch(/_rawProps[.,)"]\s*(?:["'])?count/);
    expect(code).toMatch(
      /(?:_rawProps\.some\s*\?\?\s*(?:1\s*\+\s*2|3))|(?:p0\.some\?\?1\+2)/,
    );
  });
});

describe('bug 2: destructure defaults propagate to nested segment bodies', () => {
  it('emits `(_rawProps.<key> ?? <default>)` in nested useTask body', () => {
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';

export const C = component$(({count, some = 1+2, stuffDefault: hey2 = 123}) => {
  useTask$(({track}) => {
    track(() => count);
    console.log(count, some, hey2);
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

    expect(code).toMatch(/_rawProps\.some\s*\?\?\s*(?:1\s*\+\s*2|3)/);
    expect(code).toMatch(/_rawProps\.stuffDefault\s*\?\?\s*123/);
    expect(code).toMatch(/_rawProps\.count[^?]/);
  });

  it('omits `??` for non-defaulted fields', () => {
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';

export const C = component$(({count, plain}) => {
  useTask$(({track}) => {
    track(() => count);
    console.log(count, plain);
  });
  return <div>{count}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).not.toMatch(/_rawProps\.count\s*\?\?/);
    expect(code).not.toMatch(/_rawProps\.plain\s*\?\?/);
  });

  it('does not apply defaults when consolidation aborted (gate cascade)', () => {
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';
import { hola } from 'some-lib';

export const C = component$(({count, stuff = hola()}) => {
  useTask$(({track}) => {
    track(() => count);
    console.log(count);
  });
  return <div>{count}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).not.toContain('_rawProps');
    expect(code).toMatch(/\(\{\s*count,\s*stuff\s*=\s*hola\(\)\s*\}\)\s*=>/);
  });
});

describe('bug 3: gate counts only top-level returns, not nested ones', () => {
  function findSegment(
    result: { modules: readonly TransformModule[] },
    needle: string,
  ): TransformModule {
    const seg = result.modules.find(
      (m) => m.kind === 'segment' && m.path.includes(needle),
    );
    if (!seg) throw new Error(`segment ${needle} not found`);
    return seg;
  }

  it('keeps a handler param when its only `return` is nested in control flow', () => {
    const input = `
import { component$, useContext, useTask$ } from '@qwik.dev/core';
import { rootContextId } from './ctx';

export const C = component$(({ api }) => {
  const context = useContext(rootContextId);
  useTask$(({ track }) => {
    track(() => context.path);
    if (!api?.items?.length) return;
    context.value = api.items;
  });
  return <div>{api?.items?.length}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'segment' },
    });

    const seg = findSegment(result, 'useTask');
    expect(seg.code).toMatch(/\(\{\s*track\s*\}\)\s*=>/);
    expect(seg.code).not.toMatch(/\(_rawProps\)\s*=>/);
    expect(seg.code).toContain('_captures[0]');
    expect(seg.code).toContain('_rawProps.api');
    const rawPropsDecls = seg.code.match(/(?<![\w$.])_rawProps\s*=/g) ?? [];
    expect(rawPropsDecls).toHaveLength(1);
    expectAllModulesParse(result);
  });

  it('still consolidates a component whose block returns at top level', () => {
    const input = `
import { component$ } from '@qwik.dev/core';

export const C = component$(({ label }) => {
  if (!label) {
    label;
  }
  return <div>{label}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'segment' },
    });

    const seg = findSegment(result, 'component');
    expect(seg.code).toMatch(/\(_rawProps\)\s*=>/);
    expectAllModulesParse(result);
  });
});
