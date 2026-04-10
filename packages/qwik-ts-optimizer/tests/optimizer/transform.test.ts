/**
 * Integration tests for transformModule() public API.
 *
 * Tests the complete extraction pipeline: parsing, extraction, parent rewriting,
 * and segment codegen wired together through the public entry point.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform.js';

describe('transformModule', () => {
  it('transforms a single component$ into parent + segment', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div>Hello</div>;
});`,
        },
      ],
      srcDir: '.',
    });

    expect(result.modules.length).toBeGreaterThan(1);
    // Parent module
    expect(result.modules[0].isEntry).toBe(false);
    expect(result.modules[0].segment).toBeNull();
    expect(result.modules[0].origPath).toBe('test.tsx');
    // Parent code should have componentQrl and qrl references
    expect(result.modules[0].code).toContain('componentQrl');
    expect(result.modules[0].code).toContain('qrl(');

    // Segment module
    expect(result.modules[1].isEntry).toBe(true);
    expect(result.modules[1].segment).not.toBeNull();
    expect(result.modules[1].segment!.ctxName).toBe('component$');
    expect(result.modules[1].segment!.ctxKind).toBe('function');
    expect(result.modules[1].segment!.origin).toBe('test.tsx');
    expect(result.modules[1].code).toContain('export const');
  });

  it('transforms bare $() into parent + segment', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { $ } from '@qwik.dev/core';
export const handler = $(() => {
  console.log('hello');
});`,
        },
      ],
      srcDir: '.',
    });

    expect(result.modules.length).toBe(2);
    // Parent should reference q_ variable
    expect(result.modules[0].code).toContain('q_');
    // Segment should export the body
    expect(result.modules[1].segment).not.toBeNull();
    expect(result.modules[1].segment!.ctxName).toBe('$');
    expect(result.modules[1].code).toContain('export const');
    expect(result.modules[1].code).toContain("console.log('hello')");
  });

  it('rewrites @builder.io/qwik imports to @qwik.dev/core', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@builder.io/qwik';
export const App = component$(() => {
  return <div>Hello</div>;
});`,
        },
      ],
      srcDir: '.',
    });

    // Parent module should have rewritten imports
    expect(result.modules[0].code).toContain('@qwik.dev/core');
    expect(result.modules[0].code).not.toContain('@builder.io/qwik');
  });

  it('transforms sync$ inline without producing a segment module', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { sync$ } from '@qwik.dev/core';
const fn = sync$(() => true);`,
        },
      ],
      srcDir: '.',
    });

    // sync$ should not produce a segment module
    expect(result.modules.length).toBe(1);
    expect(result.modules[0].isEntry).toBe(false);
    expect(result.modules[0].code).toContain('_qrlSync');
  });

  it('returns correct isTypeScript and isJsx flags', () => {
    const tsxResult = transformModule({
      input: [{ path: 'test.tsx', code: 'const x = 1;' }],
      srcDir: '.',
    });
    expect(tsxResult.isTypeScript).toBe(true);
    expect(tsxResult.isJsx).toBe(true);

    const tsResult = transformModule({
      input: [{ path: 'test.ts', code: 'const x = 1;' }],
      srcDir: '.',
    });
    expect(tsResult.isTypeScript).toBe(true);
    expect(tsResult.isJsx).toBe(false);

    const jsResult = transformModule({
      input: [{ path: 'test.js', code: 'const x = 1;' }],
      srcDir: '.',
    });
    expect(jsResult.isTypeScript).toBe(false);
    expect(jsResult.isJsx).toBe(false);
  });

  it('returns empty diagnostics array', () => {
    const result = transformModule({
      input: [{ path: 'test.tsx', code: 'const x = 1;' }],
      srcDir: '.',
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('extracts multiple segments from one file', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { $, component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div>Hello</div>;
});
export const handler = $(() => {
  console.log('click');
});`,
        },
      ],
      srcDir: '.',
    });

    // Parent + at least 2 segments
    expect(result.modules.length).toBeGreaterThanOrEqual(3);
    const segments = result.modules.filter((m) => m.segment !== null);
    expect(segments.length).toBeGreaterThanOrEqual(2);
  });

  it('sets segment analysis metadata correctly', () => {
    const result = transformModule({
      input: [
        {
          path: 'test.tsx',
          code: `import { component$ } from '@qwik.dev/core';
export const App = component$(() => {
  return <div>Hello</div>;
});`,
        },
      ],
      srcDir: '.',
    });

    const seg = result.modules[1].segment!;
    expect(seg.origin).toBe('test.tsx');
    expect(seg.displayName).toContain('App');
    expect(seg.displayName).toContain('component');
    expect(seg.hash).toBeTruthy();
    expect(seg.canonicalFilename).toBeTruthy();
    expect(seg.extension).toMatch(/\.(tsx|ts|js)$/);
    expect(seg.entry).toBeNull();
    expect(seg.captures).toBe(false);
    expect(seg.loc).toHaveLength(2);
    expect(seg.loc[0]).toBeGreaterThan(0);
    expect(seg.loc[1]).toBeGreaterThan(0);
  });
});
