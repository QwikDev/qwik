import { Project } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import { keepV1LoaderInvalidation, keepV1RequestBodyLimit } from './router-config';
import type { Codemod } from './run-codemods';

const run = (codemod: Codemod, code: string) => {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile('a.ts', code);
  const changed = codemod(file);
  return { changed, text: file.getFullText() };
};

describe('keepV1LoaderInvalidation', () => {
  const IMPORT = `import { qwikCity } from '@builder.io/qwik-city/vite';\n`;

  test('disables strict loaders', () => {
    expect(run(keepV1LoaderInvalidation, `${IMPORT}plugins: [qwikCity()];`).text).toBe(
      `${IMPORT}plugins: [qwikCity({ strictLoaders: false })];`
    );
    expect(
      run(keepV1LoaderInvalidation, `${IMPORT}plugins: [qwikCity({ trailingSlash: false })];`).text
    ).toBe(`${IMPORT}plugins: [qwikCity({ trailingSlash: false, strictLoaders: false })];`);
  });

  test('keeps an explicit option', () => {
    const code = `${IMPORT}qwikCity({ strictLoaders: true });`;
    expect(run(keepV1LoaderInvalidation, code)).toEqual({ changed: false, text: code });
  });
});

describe('keepV1RequestBodyLimit', () => {
  test('removes the body limit of the node and deno middlewares', () => {
    expect(
      run(
        keepV1RequestBodyLimit,
        [
          `import { createQwikCity } from '@builder.io/qwik-city/middleware/node';`,
          `const { router } = createQwikCity({`,
          `  render,`,
          `});`,
        ].join('\n')
      ).text
    ).toBe(
      [
        `import { createQwikCity } from '@builder.io/qwik-city/middleware/node';`,
        `const { router } = createQwikCity({`,
        `  render,`,
        `  requestBodyLimit: Number.MAX_SAFE_INTEGER,`,
        `});`,
      ].join('\n')
    );
  });

  test('ignores other middlewares', () => {
    const code = `import { createQwikCity } from '@builder.io/qwik-city/middleware/bun';\ncreateQwikCity({ render });`;
    expect(run(keepV1RequestBodyLimit, code)).toEqual({ changed: false, text: code });
  });
});
