import { Project } from 'ts-morph';
import { afterEach, describe, expect, test } from 'vitest';
import { takeWarnings } from '../report';
import type { Codemod } from './run-codemods';
import { removeTaskEagerness } from './tasks';

const run = (codemod: Codemod, code: string) => {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile('a.tsx', code);
  const changed = codemod(file);
  return { changed, text: file.getFullText() };
};

const IMPORT = `import { useTask$, useVisibleTask$ } from '@builder.io/qwik';\n`;

describe('removeTaskEagerness', () => {
  afterEach(() => takeWarnings());

  test('removes the eagerness option and warns', () => {
    expect(
      run(removeTaskEagerness, `${IMPORT}useTask$(() => {}, { eagerness: 'visible' });`).text
    ).toBe(`${IMPORT}useTask$(() => {});`);
    expect(
      run(
        removeTaskEagerness,
        `${IMPORT}useVisibleTask$(() => {}, { strategy: 'document-idle', eagerness: 'idle' });`
      ).text
    ).toBe(`${IMPORT}useVisibleTask$(() => {}, { strategy: 'document-idle' });`);
    expect(takeWarnings()).toHaveLength(2);
  });

  test('keeps other options', () => {
    const code = `${IMPORT}useVisibleTask$(() => {}, { strategy: 'document-ready' });`;
    expect(run(removeTaskEagerness, code)).toEqual({ changed: false, text: code });
  });
});
