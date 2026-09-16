import { describe, expect, test } from 'vitest';
import {
  keepV1HeadOrder,
  keepV1LinkPrefetch,
  keepV1ViewTransitions,
  removeSetupServiceWorker,
} from './router';
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

describe('keepV1HeadOrder', () => {
  test('turns head objects of routes into functions', () => {
    expect(
      run(
        keepV1HeadOrder,
        [
          `import type { DocumentHead } from '@builder.io/qwik-city';`,
          `export const head: DocumentHead = {`,
          `  title: 'Home',`,
          `};`,
          `const layoutHead = { title: 'Layout' } satisfies DocumentHead;`,
          `export { layoutHead as head };`,
        ].join('\n'),
        'src/routes/index.tsx'
      ).text
    ).toBe(
      [
        `import type { DocumentHead } from '@builder.io/qwik-city';`,
        `export const head: DocumentHead = () => ({`,
        `  title: 'Home',`,
        `});`,
        `const layoutHead = () => ({ title: 'Layout' } satisfies DocumentHead);`,
        `export { layoutHead as head };`,
      ].join('\n')
    );
  });

  test('keeps head functions and files outside routes', () => {
    for (const [code, path] of [
      [
        `export const head: DocumentHead = ({ head }) => ({ title: head.title });`,
        'src/routes/a.tsx',
      ],
      [`export const head = { title: 'x' };`, 'src/components/a.tsx'],
    ]) {
      expect(run(keepV1HeadOrder, code, path)).toEqual({ changed: false, text: code });
    }
  });
});

describe('keepV1LinkPrefetch', () => {
  const IMPORT = `import { Link } from '@builder.io/qwik-city';\n`;

  test('maps the v1 prefetch behavior to the v2 props', () => {
    expect(
      run(
        keepV1LinkPrefetch,
        `${IMPORT}<><Link href="/a" /><Link href="/b" prefetch /><Link href="/c" prefetch={false}>c</Link><Link href="/d" prefetch="js" /></>;`
      ).text
    ).toBe(
      `${IMPORT}<><Link href="/a" prefetchData="visible" /><Link href="/b" prefetchData="visible" /><Link href="/c" prefetchBundles="off" prefetchData="off">c</Link><Link href="/d" prefetchData="off" /></>;`
    );
  });

  test('keeps dynamic values and ignores other Link components', () => {
    for (const code of [
      `${IMPORT}<Link href="/a" prefetch={enabled} />;`,
      `import { Link } from './link';\n<Link href="/a" />;`,
    ]) {
      expect(run(keepV1LinkPrefetch, code)).toEqual({ changed: false, text: code });
    }
  });
});
