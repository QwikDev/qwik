import { Project } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import { replaceRemovedJsxTypes } from './core-types';
import type { Codemod } from './run-codemods';

const run = (codemod: Codemod, code: string) => {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile('a.tsx', code);
  const changed = codemod(file);
  return { changed, text: file.getFullText() };
};

describe('replaceRemovedJsxTypes', () => {
  test('replaces HTML attribute types with the JSX element types', () => {
    expect(
      run(
        replaceRemovedJsxTypes,
        [
          `import { component$, type InputHTMLAttributes, type HTMLAttributes } from '@builder.io/qwik';`,
          `type Props = InputHTMLAttributes<HTMLInputElement> & { wrapper?: HTMLAttributes<HTMLDivElement> };`,
        ].join('\n')
      ).text
    ).toBe(
      [
        `import { component$, type QwikJSX } from '@builder.io/qwik';`,
        `type Props = QwikJSX.IntrinsicElements['input'] & { wrapper?: QwikJSX.IntrinsicElements['div'] };`,
      ].join('\n')
    );
  });

  test('inlines removed helper types and removes an empty import', () => {
    expect(
      run(
        replaceRemovedJsxTypes,
        [
          `import type { Booleanish, Size as S, HTMLAttributeReferrerPolicy, AriaRole } from '@builder.io/qwik';`,
          `let a: Booleanish[];`,
          `let b: S;`,
          `let c: HTMLAttributeReferrerPolicy;`,
          `let d: AriaRole;`,
        ].join('\n')
      ).text
    ).toBe(
      [
        `import type { QwikJSX } from '@builder.io/qwik';`,
        `let a: (boolean | \`\${boolean}\`)[];`,
        `let b: (number | string);`,
        `let c: ReferrerPolicy;`,
        `let d: NonNullable<QwikJSX.IntrinsicElements['div']['role']>;`,
      ].join('\n')
    );
  });

  test('ignores types from other modules', () => {
    const code = `import type { InputHTMLAttributes } from 'react';\nlet a: InputHTMLAttributes<HTMLInputElement>;`;
    expect(run(replaceRemovedJsxTypes, code)).toEqual({ changed: false, text: code });
  });
});
