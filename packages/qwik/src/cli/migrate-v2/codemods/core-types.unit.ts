import { describe, expect, test } from 'vitest';
import {
  moveInternalImports,
  replaceEventTypes,
  replaceReadonlySignal,
  replaceRemovedJsxTypes,
} from './core-types';
import { createProject, type Codemod } from './run-codemods';

const run = (codemod: Codemod, code: string) => {
  const file = createProject({ useInMemoryFileSystem: true }).createSourceFile('a.tsx', code);
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

describe('replaceEventTypes', () => {
  test('replaces the deprecated event aliases with DOM events', () => {
    expect(
      run(
        replaceEventTypes,
        [
          `import { $, type QwikMouseEvent, type QwikKeyboardEvent, type NativeWheelEvent, type QwikChangeEvent } from '@builder.io/qwik';`,
          `const a = $((e: QwikMouseEvent<HTMLButtonElement>) => {});`,
          `const b = $((e: QwikMouseEvent<HTMLElement, PointerEvent>) => {});`,
          `const c = $((e: QwikKeyboardEvent<HTMLInputElement>, w: NativeWheelEvent, ch: QwikChangeEvent) => {});`,
        ].join('\n')
      ).text
    ).toBe(
      [
        `import { $ } from '@builder.io/qwik';`,
        `const a = $((e: MouseEvent) => {});`,
        `const b = $((e: PointerEvent) => {});`,
        `const c = $((e: KeyboardEvent, w: WheelEvent, ch: Event) => {});`,
      ].join('\n')
    );
  });

  test('replaces PropFunction with QRL', () => {
    expect(
      run(
        replaceEventTypes,
        [
          `import { component$, type PropFunction } from '@builder.io/qwik';`,
          `export const C = component$((props: { onClick$: PropFunction<() => void> }) => null);`,
        ].join('\n')
      ).text
    ).toBe(
      [
        `import { component$, type QRL } from '@builder.io/qwik';`,
        `export const C = component$((props: { onClick$: QRL<() => void> }) => null);`,
      ].join('\n')
    );
  });
});

describe('moveInternalImports', () => {
  test('moves non public APIs to the internal entry point', () => {
    expect(
      run(
        moveInternalImports,
        [
          `import { component$, componentQrl, type Tracker as T, h } from '@builder.io/qwik';`,
          `import type { SSRStreamProps } from '@builder.io/qwik';`,
        ].join('\n')
      ).text
    ).toBe(
      [
        `import { component$ } from '@builder.io/qwik';`,
        `import { componentQrl, type Tracker as T, h } from '@builder.io/qwik/internal';`,
        `import type { SSRStreamProps } from '@builder.io/qwik/internal';`,
      ].join('\n')
    );
  });

  test('keeps public APIs', () => {
    const code = `import { component$, useTask$ } from '@builder.io/qwik';`;
    expect(run(moveInternalImports, code)).toEqual({ changed: false, text: code });
  });
});

describe('replaceReadonlySignal', () => {
  test('replaces ReadonlySignal with its v1 definition', () => {
    expect(
      run(
        replaceReadonlySignal,
        [
          `import { useComputed$, type ReadonlySignal } from '@builder.io/qwik';`,
          `const a: ReadonlySignal<string> = useComputed$(() => '');`,
        ].join('\n')
      ).text
    ).toBe(
      [
        `import { useComputed$, type Signal } from '@builder.io/qwik';`,
        `const a: Readonly<Signal<string>> = useComputed$(() => '');`,
      ].join('\n')
    );
  });
});
