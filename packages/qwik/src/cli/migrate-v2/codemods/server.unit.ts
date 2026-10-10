import { afterEach, describe, expect, test } from 'vitest';
import { takeWarnings } from '../report';
import { createProject, type Codemod } from './run-codemods';
import {
  keepV1StreamingDefaults,
  removeRemovedRenderOptions,
  renameMaximunStreamingOptions,
  replaceClientManifestImport,
} from './server';

const run = (codemod: Codemod, code: string) => {
  const file = createProject({ useInMemoryFileSystem: true }).createSourceFile(
    'entry.ssr.tsx',
    code
  );
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

describe('keepV1StreamingDefaults', () => {
  test('adds the v1 in-order defaults to the v1 starter entry', () => {
    expect(
      run(
        keepV1StreamingDefaults,
        [
          `import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server';`,
          `import Root from './root';`,
          ``,
          `export default function (opts: RenderToStreamOptions) {`,
          `  return renderToStream(<Root />, {`,
          `    ...opts,`,
          `    containerAttributes: {`,
          `      lang: 'en-us',`,
          `      ...opts.containerAttributes,`,
          `    },`,
          `  });`,
          `}`,
        ].join('\n')
      ).text
    ).toBe(
      [
        `import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server';`,
        `import Root from './root';`,
        ``,
        `export default function (opts: RenderToStreamOptions) {`,
        `  return renderToStream(<Root />, {`,
        `    ...opts,`,
        `    containerAttributes: {`,
        `      lang: 'en-us',`,
        `      ...opts.containerAttributes,`,
        `    },`,
        `    streaming: { ...opts.streaming, inOrder: { strategy: 'auto', maximumInitialChunk: 50000, maximumChunk: 30000 } },`,
        `  });`,
        `}`,
      ].join('\n')
    );
  });

  test('adds inOrder to existing streaming options', () => {
    expect(
      run(
        keepV1StreamingDefaults,
        [
          IMPORT + `renderToStream(<Root />, {`,
          `  streaming: {`,
          `    timeout: 1,`,
          `  },`,
          `});`,
        ].join('\n')
      ).text
    ).toBe(
      [
        IMPORT + `renderToStream(<Root />, {`,
        `  streaming: {`,
        `    timeout: 1,`,
        `    inOrder: { strategy: 'auto', maximumInitialChunk: 50000, maximumChunk: 30000 },`,
        `  },`,
        `});`,
      ].join('\n')
    );
  });

  test('keeps an explicit inOrder and ignores renderToString', () => {
    for (const code of [
      `${IMPORT}renderToStream(<Root />, { streaming: { inOrder: { strategy: 'direct' } } });`,
      `${IMPORT}renderToString(<Root />, {});`,
    ]) {
      expect(run(keepV1StreamingDefaults, code)).toEqual({ changed: false, text: code });
    }
  });
});

describe('replaceClientManifestImport', () => {
  test('replaces the deprecated module with getClientManifest()', () => {
    expect(
      run(
        replaceClientManifestImport,
        [
          `import { renderToStream } from '@builder.io/qwik/server';`,
          `import { manifest } from '@qwik-client-manifest';`,
          `import Root from './root';`,
          `export default (opts) => renderToStream(<Root />, { manifest, ...opts });`,
        ].join('\n')
      ).text
    ).toBe(
      [
        `import { renderToStream } from '@builder.io/qwik/server';`,
        `import Root from './root';`,
        `import { getClientManifest } from '@builder.io/qwik';`,
        `const manifest = getClientManifest();`,
        ``,
        `export default (opts) => renderToStream(<Root />, { manifest, ...opts });`,
      ].join('\n')
    );
  });

  test('does nothing without the import', () => {
    const code = `import { manifest } from './manifest';`;
    expect(run(replaceClientManifestImport, code)).toEqual({ changed: false, text: code });
  });
});
