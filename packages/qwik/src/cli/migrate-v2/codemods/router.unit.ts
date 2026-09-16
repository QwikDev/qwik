import { describe, expect, test } from 'vitest';
import { keepV1ViewTransitions, removeSetupServiceWorker } from './router';
import { createProject, type Codemod } from './run-codemods';

const run = (codemod: Codemod, code: string, path = 'src/a.tsx') => {
  const file = createProject({ useInMemoryFileSystem: true }).createSourceFile(path, code);
  const changed = codemod(file);
  return { changed, text: file.getFullText() };
};

describe('removeSetupServiceWorker', () => {
  test('removes the import and the call', () => {
    expect(
      run(
        removeSetupServiceWorker,
        [
          `import { setupServiceWorker } from '@builder.io/qwik-city/service-worker';`,
          ``,
          `setupServiceWorker();`,
          ``,
          `addEventListener('install', () => self.skipWaiting());`,
        ].join('\n'),
        'src/routes/service-worker.ts'
      )
    ).toEqual({
      changed: true,
      text: `addEventListener('install', () => self.skipWaiting());`,
    });
  });

  test('does nothing without the import', () => {
    const code = `setupServiceWorker();`;
    expect(run(removeSetupServiceWorker, code)).toEqual({ changed: false, text: code });
  });
});

describe('keepV1ViewTransitions', () => {
  test('enables view transitions and adds the v1 root style', () => {
    expect(
      run(
        keepV1ViewTransitions,
        [
          `import { component$ } from '@builder.io/qwik';`,
          `import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city';`,
          `export default component$(() => {`,
          `  return (`,
          `    <QwikCityProvider>`,
          `      <RouterOutlet />`,
          `    </QwikCityProvider>`,
          `  );`,
          `});`,
        ].join('\n')
      ).text
    ).toBe(
      [
        `import { component$, useStyles$ } from '@builder.io/qwik';`,
        `import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city';`,
        `export default component$(() => {`,
        '  useStyles$(`:root{view-transition-name:none}`);',
        `  return (`,
        `    <QwikCityProvider viewTransition={true}>`,
        `      <RouterOutlet />`,
        `    </QwikCityProvider>`,
        `  );`,
        `});`,
      ].join('\n')
    );
  });

  test('keeps explicit values and handles dynamic ones and expression bodies', () => {
    expect(
      run(
        keepV1ViewTransitions,
        [
          `import { QwikCityProvider } from '@builder.io/qwik-city';`,
          `export default component$(() => <QwikCityProvider viewTransition={enabled} />);`,
        ].join('\n')
      ).text
    ).toBe(
      [
        `import { QwikCityProvider } from '@builder.io/qwik-city';`,
        `import { useStyles$ } from '@builder.io/qwik';`,
        ``,
        `export default component$(() => {`,
        '  useStyles$(`:root{view-transition-name:none}`);',
        `  return <QwikCityProvider viewTransition={enabled !== false} />;`,
        `});`,
      ].join('\n')
    );
  });
});
