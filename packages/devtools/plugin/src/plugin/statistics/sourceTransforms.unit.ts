import { describe, expect, test } from 'vitest';
import {
  findQwikLazyComponentExports,
  rewriteComponentQrlImport,
  shouldTransformStatisticsSource,
  wrapQwikLazyComponentExports,
} from './sourceTransforms';

describe('sourceTransforms', () => {
  test('skips devtools UI sources to avoid instrumenting the performance panel itself', () => {
    expect(
      shouldTransformStatisticsSource('/repo/packages/devtools/ui/src/features/Performance.tsx')
    ).toBe(false);
    expect(shouldTransformStatisticsSource('/repo/packages/devtools/ui/lib/devtools.js')).toBe(
      false
    );
  });

  test('escapes Windows module ids in wrapped lazy component exports', () => {
    const id = 'C:\\Users\\alice\\src\\app\\entry_component_abc123.tsx';
    const source = `
export const Foo_component_abc123 = () => null;
`;

    const result = wrapQwikLazyComponentExports({
      code: source,
      id,
      exports: ['Foo_component_abc123'],
    });

    expect(result.changed).toBe(true);
    expect(result.code).toContain(JSON.stringify(id));
    expect(result.code).toContain(
      '__qwik_wrap__(__original_Foo_component_abc123__, "Foo_component_abc123"'
    );
    expect(result.code).not.toContain(`'${id}'`);
  });

  test('finds lazy component exports from AST nodes and ignores matching strings', () => {
    const source = `
const fixture = "export const Fake_component_abc123 = () => null;";
// export const Comment_component_abc123 = () => null;
export const Real_component_abc123 = () => null;
`;

    expect(findQwikLazyComponentExports(source)).toEqual(['Real_component_abc123']);
  });

  test('rewrites multiline componentQrl import and preserves other core imports', () => {
    const source = `import {
  componentQrl,
  useSignal,
  useStore,
} from '@qwik.dev/core';

export const cmp = componentQrl(() => import('./entry'), 'Cmp');
`;

    const result = rewriteComponentQrlImport(source, '/repo/src/entry.tsx');

    expect(result.changed).toBe(true);
    expect(result.code).toContain(
      `import { useSignal, useStore } from '@qwik.dev/core';\nimport { componentQrl } from 'virtual:qwik-component-proxy'`
    );
    expect(result.code).toContain(
      `export const cmp = componentQrl(() => import('./entry'), 'Cmp');`
    );
  });

  test('does not rewrite aliased componentQrl imports', () => {
    const source = `import { componentQrl as cqrl, useSignal } from '@qwik.dev/core';

export const cmp = cqrl(() => import('./entry'), 'Cmp');
`;

    const result = rewriteComponentQrlImport(source, '/repo/src/entry.tsx');

    expect(result.changed).toBe(false);
    expect(result.code).toBe(source);
  });

  test('does not rewrite type-only componentQrl imports', () => {
    const source = `import type { componentQrl, Signal } from '@qwik.dev/core';

type ComponentQrl = typeof componentQrl;
type CounterSignal = Signal<number>;
`;

    const result = rewriteComponentQrlImport(source, '/repo/src/types.ts');

    expect(result.changed).toBe(false);
    expect(result.code).toBe(source);
  });

  test('does not rewrite specifier-level type-only componentQrl imports', () => {
    const source = `import { component$, type componentQrl } from '@qwik.dev/core';

export const Counter = component$(() => null);
type ComponentQrl = typeof componentQrl;
`;

    const result = rewriteComponentQrlImport(source, '/repo/src/counter.tsx');

    expect(result.changed).toBe(false);
    expect(result.code).toBe(source);
  });
});
