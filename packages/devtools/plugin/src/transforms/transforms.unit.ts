import { describe, expect, test } from 'vitest';
import { parseSync } from 'oxc-parser';
import { transformComponentFile } from './component-transform';
import { rewriteComponentQrlImport } from './perf-transform';
import { transformRootFile } from './root-transform';

const COMPONENT_SOURCE = `
import { component$, useSignal } from '@qwik.dev/core';

export const Counter = component$(() => {
  const count = useSignal(0);
  return <button>{count.value}</button>;
});
`;

const ROOT_SOURCE = `
import { component$ } from '@qwik.dev/core';

export default component$(() => {
  return (
    <html>
      <head />
      <body>
        <main>Docs</main>
      </body>
    </html>
  );
});
`;

// Source locations (data-qwik-inspector, QRL dev spans) are computed after these transforms.
function expectSameSourceLines(source: string, transformed: string) {
  const sourceLines = source.split('\n');
  const transformedLines = transformed.split('\n');
  expect(parseSync('file.tsx', transformed, { lang: 'tsx' }).errors).toEqual([]);
  expect(transformedLines).toHaveLength(sourceLines.length);
  sourceLines.forEach((line, index) => {
    expect(transformedLines[index]).toContain(line.trim());
  });
}

describe('transform facades', () => {
  test('component transform injects useCollectHooks import and collecthook init', () => {
    const transformed = transformComponentFile(
      COMPONENT_SOURCE,
      '/repo/src/components/counter.tsx'
    );

    expect(transformed).toContain("import { useCollectHooks } from 'virtual-qwik-devtools.ts';");
    expect(transformed).toContain(
      'const collecthook = useCollectHooks("/repo/src/components/counter.tsx_Counter")'
    );
  });

  test('component collector identifies an anonymous default export explicitly', () => {
    expect(
      transformComponentFile(ROOT_SOURCE, '/repo/src/routes/some-fancy-route/index.tsx')
    ).toContain('useCollectHooks("/repo/src/routes/some-fancy-route/index.tsx_default")');
  });

  test('root transform injects QwikDevtools imports and excluded pathnames prop', () => {
    const transformed = transformRootFile(ROOT_SOURCE, {
      overlay: { excludePathnames: ['admin/', '/docs'] },
    });

    expect(transformed).toContain("import { QwikDevtools } from '@qwik.dev/devtools/ui';");
    expect(transformed).toContain("import '@qwik.dev/devtools/ui/styles.css';");
    expect(transformed).toContain('<QwikDevtools excludePathnames={["/admin","/docs"]} />');
  });

  test('root transform injects into the JSX body instead of matching body-like strings', () => {
    const source = `
const fakeHtml = '<body><main>String body</main></body>';

export default component$(() => {
  return (
    <html>
      <body>
        <main>Real body</main>
      </body>
    </html>
  );
});
`;

    const transformed = transformRootFile(source);

    expect(transformed).toContain("const fakeHtml = '<body><main>String body</main></body>';");
    expect(transformed).toContain('<main>Real body</main>\n      <QwikDevtools /></body>');
  });

  test('component transform keeps every source line on its original line number', () => {
    const source = `import { component$, useSignal, useStore, useTask$ } from '@qwik.dev/core';
import { useCounter, useLogger } from './hooks';

export const Counter = component$(() => {
  const count = useSignal(0)
  const state = useStore({ items: [] });
  const local = useCounter();
  useLogger();
  useTask$(({ track }) => {
    track(() => count.value);
  });
  return (
    <button onClick$={() => count.value++}>
      {count.value} {state.items.length} {local}
    </button>
  );
});

export default component$(() => <Counter />);
`;

    const transformed = transformComponentFile(source, '/repo/src/components/counter.tsx');

    expect(transformed).toContain('collecthook(');
    expectSameSourceLines(source, transformed);
  });

  test('root transform keeps every source line on its original line number', () => {
    const transformed = transformRootFile(ROOT_SOURCE);

    expect(transformed).toContain('<QwikDevtools />');
    expectSameSourceLines(ROOT_SOURCE, transformed);
  });

  test('perf transform rewrites componentQrl import', () => {
    const result = rewriteComponentQrlImport(
      `import { component$, componentQrl, useSignal } from '@qwik.dev/core';`,
      '/repo/src/entry.tsx'
    );

    expect(result.changed).toBe(true);
    expect(result.code).toContain("import { component$, useSignal } from '@qwik.dev/core';");
    expect(result.code).toContain("import { componentQrl } from 'virtual:qwik-component-proxy'");
  });
});
