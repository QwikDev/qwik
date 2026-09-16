import { Project } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import type { Codemod } from './run-codemods';
import { renameMaximunStreamingOptions } from './server';

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
