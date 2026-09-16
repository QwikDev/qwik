import { Project } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import { renameHtmlFor } from './jsx';
import type { Codemod } from './run-codemods';

const run = (codemod: Codemod, code: string) => {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile('a.tsx', code);
  const changed = codemod(file);
  return { changed, text: file.getFullText() };
};

describe('renameHtmlFor', () => {
  test('renames htmlFor on DOM elements only', () => {
    expect(
      run(
        renameHtmlFor,
        `<><label htmlFor="a" /><Field htmlFor="b" /><output htmlFor={c}></output></>;`
      )
    ).toEqual({
      changed: true,
      text: `<><label for="a" /><Field htmlFor="b" /><output for={c}></output></>;`,
    });
  });

  test('does nothing without htmlFor', () => {
    const code = `<label for="a" />;`;
    expect(run(renameHtmlFor, code)).toEqual({ changed: false, text: code });
  });
});
