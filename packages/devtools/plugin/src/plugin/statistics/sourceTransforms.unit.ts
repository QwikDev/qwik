import { describe, expect, test } from 'vitest';
import { transformModule } from '../../../../../ts-optimizer/src';
import { mkFilePath, mkSourceText } from '../../../../../ts-optimizer/src/optimizer/types/brands';
import { statisticsPlugin } from '../statistics';
import {
  findQwikLazyComponentExports,
  rewriteComponentQrlImport,
  shouldTransformStatisticsSource,
  wrapHoistedComponentSegments,
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

  test('wraps render functions hoisted into their parent module, as SSR builds them', () => {
    const source = `const Foo_component_abc123 = () => null;
q_Foo_component_abc123.s(Foo_component_abc123);
const onClick = () => null;
q_onClick_abc123.s(onClick);
`;

    const result = wrapHoistedComponentSegments(source, '/src/routes/index.tsx');

    expect(result.code).toContain(
      'q_Foo_component_abc123.s(__qwik_wrap_render__(Foo_component_abc123, "Foo_component_abc123", q_Foo_component_abc123));'
    );
    expect(result.code).toContain('q_onClick_abc123.s(onClick);');
    // User source keeps its line numbers for stack traces and breakpoints.
    expect(result.code.split('\n')).toHaveLength(source.split('\n').length);
    expect(result.code.split('\n')[1]).toContain('q_Foo_component_abc123.s(');
  });

  test('wraps the render functions of real SSR optimizer output', () => {
    const { modules } = transformModule({
      input: [
        {
          path: mkFilePath('cmp.tsx'),
          code: mkSourceText(`import { component$, useTask$ } from '@qwik.dev/core';
export const Cmp = component$(() => {
  useTask$(() => {});
  return <p onClick$={() => {}}>hi</p>;
});`),
        },
      ],
      srcDir: mkFilePath('/src'),
      entryStrategy: { type: 'hoist' },
      mode: 'dev',
      isServer: true,
      transpileTs: true,
      transpileJsx: true,
    });
    const parent = modules.find((module) => module.kind === 'parent')!;

    const result = wrapHoistedComponentSegments(parent.code, '/src/cmp.tsx');

    expect(result.code.match(/__qwik_wrap_render__\(/g)).toHaveLength(3);
    expect(result.code).toMatch(/\.s\(__qwik_wrap_render__\(Cmp_component_\w+, /);
  });

  test('wraps hoisted renders even when the file path contains _component_', () => {
    const transform = statisticsPlugin().transform as (
      code: string,
      id: string
    ) => { code: string } | null;
    const source = 'q_Foo_component_abc123.s(Foo_component_abc123);';

    expect(transform(source, '/src/date_component_v2.tsx')?.code).toContain(
      '__qwik_wrap_render__(Foo_component_abc123'
    );
  });

  test('leaves modules without hoisted render functions untouched', () => {
    const source = 'const a = 1;\nexport const b = a.s(a);\nqrls[0].s(Foo_component_abc123);';

    expect(wrapHoistedComponentSegments(source, '/src/a.tsx')).toEqual({
      code: source,
      changed: false,
    });
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
