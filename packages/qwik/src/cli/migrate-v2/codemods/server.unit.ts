import { Project } from 'ts-morph';
import { afterEach, describe, expect, test } from 'vitest';
import { takeWarnings } from '../report';
import type { Codemod } from './run-codemods';
import { removeRemovedRenderOptions, renameMaximunStreamingOptions } from './server';

const run = (codemod: Codemod, code: string) => {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile('entry.ssr.tsx', code);
  const changed = codemod(file);
  return { changed, text: file.getFullText() };
};

const IMPORT = `import { renderToStream, renderToString } from '@builder.io/qwik/server';\n`;

describe('renameMaximunStreamingOptions', () => {
  test('renames the misspelled options', () => {
    expect(
      run(
        renameMaximunStreamingOptions,
        `${IMPORT}renderToStream(<Root />, { streaming: { inOrder: { strategy: 'auto', maximunInitialChunk: 1, maximunChunk: 2 } } });`
      ).text
    ).toBe(
      `${IMPORT}renderToStream(<Root />, { streaming: { inOrder: { strategy: 'auto', maximumInitialChunk: 1, maximumChunk: 2 } } });`
    );
  });

  test('ignores calls not imported from the server package', () => {
    const code = `renderToStream(<Root />, { streaming: { inOrder: { maximunChunk: 2 } } });`;
    expect(run(renameMaximunStreamingOptions, code)).toEqual({ changed: false, text: code });
  });
});

describe('removeRemovedRenderOptions', () => {
  afterEach(() => takeWarnings());

  test('prefetchStrategy: null disables the preloader', () => {
    expect(
      run(
        removeRemovedRenderOptions,
        `${IMPORT}renderToString(<Root />, { prefetchStrategy: null });`
      ).text
    ).toBe(`${IMPORT}renderToString(<Root />, { preloader: false });`);
  });

  test('prefetchStrategy: null keeps a multi-line format', () => {
    expect(
      run(
        removeRemovedRenderOptions,
        [
          IMPORT + `renderToStream(<Root />, {`,
          `  ...opts,`,
          `  prefetchStrategy: null,`,
          `});`,
        ].join('\n')
      ).text
    ).toBe(
      [IMPORT + `renderToStream(<Root />, {`, `  ...opts,`, `  preloader: false,`, `});`].join('\n')
    );
  });

  test('removes deprecated prefetch and preloader options', () => {
    expect(
      run(
        removeRemovedRenderOptions,
        `${IMPORT}renderToStream(<Root />, { ...opts, prefetchStrategy: { implementation: {} }, qwikPrefetchServiceWorker: {}, preloader: { ssrPreloads: 3, debug: true, preloadProbability: 0.5, ssrPreloadProbability: 0.5 } });`
      ).text
    ).toBe(`${IMPORT}renderToStream(<Root />, { ...opts, preloader: { ssrPreloads: 3 } });`);
    expect(takeWarnings()).toEqual([]);
  });

  test('warns about symbolsToPrefetch', () => {
    run(
      removeRemovedRenderOptions,
      `${IMPORT}renderToStream(<Root />, { prefetchStrategy: { symbolsToPrefetch: () => [] } });`
    );
    expect(takeWarnings()).toEqual([
      '/entry.ssr.tsx: `prefetchStrategy.symbolsToPrefetch` was removed in v2, preloading is based on the bundle graph.',
    ]);
  });
});
