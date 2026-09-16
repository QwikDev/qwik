import { Project } from 'ts-morph';
import { afterEach, describe, expect, test } from 'vitest';
import { takeWarnings } from '../report';
import type { Codemod } from './run-codemods';
import { keepV1TaskCleanupTiming, removeTaskEagerness } from './tasks';

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

describe('keepV1TaskCleanupTiming', () => {
  test('wraps cleanups that may return a promise', () => {
    expect(
      run(
        keepV1TaskCleanupTiming,
        [
          IMPORT + `useTask$(({ track, cleanup }) => {`,
          `  cleanup(async () => await close());`,
          `  cleanup(() => { clearInterval(id); });`,
          `});`,
        ].join('\n')
      ).text
    ).toBe(
      [
        IMPORT + `useTask$(({ track, cleanup }) => {`,
        `  cleanup(() => {`,
        `    void (async () => await close())();`,
        `  });`,
        `  cleanup(() => { clearInterval(id); });`,
        `});`,
      ].join('\n')
    );
  });

  test('wraps returned cleanups and ctx.cleanup calls', () => {
    expect(
      run(
        keepV1TaskCleanupTiming,
        [
          IMPORT + `useVisibleTask$((ctx) => {`,
          `  ctx.cleanup(() => stop());`,
          `  const inner = () => { return 1; };`,
          `  return () => close();`,
          `});`,
        ].join('\n')
      ).text
    ).toBe(
      [
        IMPORT + `useVisibleTask$((ctx) => {`,
        `  ctx.cleanup(() => {`,
        `    void (() => stop())();`,
        `  });`,
        `  const inner = () => { return 1; };`,
        `  return () => {`,
        `    void (() => close())();`,
        `  };`,
        `});`,
      ].join('\n')
    );
  });

  test('keeps sync cleanups and tasks from other modules', () => {
    for (const code of [
      `${IMPORT}useTask$(({ cleanup }) => { cleanup(() => { stop(); }); });`,
      `import { useTask$ } from 'x';\nuseTask$(({ cleanup }) => { cleanup(async () => {}); });`,
    ]) {
      expect(run(keepV1TaskCleanupTiming, code)).toEqual({ changed: false, text: code });
    }
  });
});
