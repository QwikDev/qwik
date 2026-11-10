import { describe, expect, test } from 'vitest';
import { removeSlotChildren, renameHtmlFor } from './jsx';
import { createProject, type Codemod } from './run-codemods';

const run = (codemod: Codemod, code: string) => {
  const file = createProject({ useInMemoryFileSystem: true }).createSourceFile('a.tsx', code);
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

describe('removeSlotChildren', () => {
  test('removes the children that v1 never rendered', () => {
    expect(
      run(
        removeSlotChildren,
        [
          `import { Slot as S } from '@builder.io/qwik';`,
          `<div><S name="a">fallback</S><S>`,
          `  <p>x</p>`,
          `</S><S /></div>;`,
        ].join('\n')
      ).text
    ).toBe(
      [
        `import { Slot as S } from '@builder.io/qwik';`,
        `<div><S name="a" /><S /><S /></div>;`,
      ].join('\n')
    );
  });

  test('ignores other Slot components', () => {
    const code = `import { Slot } from './slot';\n<Slot>x</Slot>;`;
    expect(run(removeSlotChildren, code)).toEqual({ changed: false, text: code });
  });
});
