import { describe, expect, test } from 'vitest';
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
    expect(transformed).toContain('<main>Real body</main>\n        <QwikDevtools />');
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
