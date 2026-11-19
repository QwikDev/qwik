import { describe, expect, test } from 'vitest';
import { removePrefetchGraph, removeSlotChildren, renameHtmlFor } from './jsx';
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

describe('removePrefetchGraph', () => {
  test('removes the elements and the import, keeps PrefetchServiceWorker', () => {
    expect(
      run(
        removePrefetchGraph,
        [
          `import { PrefetchGraph as Graph, PrefetchServiceWorker } from '@builder.io/qwik';`,
          `<head><PrefetchServiceWorker /><Graph base="/build/" /></head>;`,
        ].join('\n')
      )
    ).toEqual({
      changed: true,
      text: [
        `import { PrefetchServiceWorker } from '@builder.io/qwik';`,
        `<head><PrefetchServiceWorker /></head>;`,
      ].join('\n'),
    });
  });

  test('removes an import declaration left empty', () => {
    expect(
      run(
        removePrefetchGraph,
        [
          `import { PrefetchGraph } from '@builder.io/qwik';`,
          `import { component$ } from '@builder.io/qwik';`,
          `<head><PrefetchGraph /></head>;`,
        ].join('\n')
      ).text
    ).toBe([`import { component$ } from '@builder.io/qwik';`, `<head></head>;`].join('\n'));
  });

  test('removes the lines of formatted elements', () => {
    expect(
      run(
        removePrefetchGraph,
        [
          `import { PrefetchGraph } from '@builder.io/qwik';`,
          `<>`,
          `  <PrefetchGraph />`,
          `  text`,
          `  <PrefetchGraph />`,
          `</>;`,
        ].join('\n')
      ).text
    ).toBe([`<>`, `  text`, `</>;`].join('\n'));
  });

  test('keeps the import when it is used outside JSX children', () => {
    const code = [
      `import { PrefetchGraph } from '@builder.io/qwik';`,
      `const head = <PrefetchGraph />;`,
    ].join('\n');
    expect(run(removePrefetchGraph, code)).toEqual({ changed: false, text: code });
  });
});
