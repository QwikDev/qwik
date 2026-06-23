import { describe, expect, test } from 'vitest';
import { transformRootFile } from './virtualModules';

const ROOT_SOURCE = `
import { component$ } from '@qwik.dev/core';

export default component$(() => {
  return (
    <>
      <head></head>
      <body>
        <main>Docs</main>
      </body>
    </>
  );
});
`;

describe('transformRootFile', () => {
  test('injects the devtools overlay unconditionally by default', () => {
    const transformed = transformRootFile(ROOT_SOURCE);

    expect(transformed).toContain("import { QwikDevtools } from '@qwik.dev/devtools/ui';");
    expect(transformed).toContain('<QwikDevtools />');
    expect(transformed).not.toContain('excludePathnames');
  });

  test('passes excluded pathnames to the devtools overlay component', () => {
    const transformed = transformRootFile(ROOT_SOURCE, {
      overlay: { excludePathnames: ['/demo'] },
    });

    expect(transformed).toContain('<QwikDevtools excludePathnames={["/demo"]} />');
    expect(transformed).not.toContain('QwikDevtoolsRootGuard');
    expect(transformed).not.toContain('qwikDevtoolsUseVisibleTask$');
    expect(transformed).not.toContain('\n        <QwikDevtools />');
  });

  test('normalizes excluded pathnames before passing them as props', () => {
    const transformed = transformRootFile(ROOT_SOURCE, {
      overlay: { excludePathnames: ['demo/', '/demo', ''] },
    });

    expect(transformed).toContain('<QwikDevtools excludePathnames={["/demo"]} />');
  });
});
