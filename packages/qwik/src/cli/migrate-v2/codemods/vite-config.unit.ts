import { Project } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import type { Codemod } from './run-codemods';
import { removeDevInput, removeStableExperimentalFeatures } from './vite-config';

const run = (codemod: Codemod, code: string) => {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile(
    'vite.config.ts',
    code
  );
  const changed = codemod(file);
  return { changed, text: file.getFullText() };
};

const IMPORT = `import { qwikVite } from '@builder.io/qwik/optimizer';\n`;

describe('removeDevInput', () => {
  test('removes client.devInput', () => {
    expect(
      run(
        removeDevInput,
        `${IMPORT}export default { plugins: [qwikVite({ client: { devInput: 'src/entry.dev.tsx', outDir: 'dist' } })] };`
      )
    ).toEqual({
      changed: true,
      text: `${IMPORT}export default { plugins: [qwikVite({ client: { outDir: 'dist' } })] };`,
    });
  });

  test('ignores other plugins', () => {
    const code = `import { qwikVite } from 'other';\nqwikVite({ client: { devInput: 'a' } });`;
    expect(run(removeDevInput, code)).toEqual({ changed: false, text: code });
  });
});

describe('removeStableExperimentalFeatures', () => {
  test('removes the flags that are always enabled in v2', () => {
    expect(
      run(
        removeStableExperimentalFeatures,
        `${IMPORT}qwikVite({ experimental: ['preventNavigate', 'valibot', 'enableRequestRewrite'] });`
      ).text
    ).toBe(`${IMPORT}qwikVite({ experimental: ['valibot'] });`);
  });

  test('removes the option when no flag is left', () => {
    expect(
      run(
        removeStableExperimentalFeatures,
        `${IMPORT}qwikVite({ debug: true, experimental: ['preventNavigate'] });`
      ).text
    ).toBe(`${IMPORT}qwikVite({ debug: true });`);
  });

  test('keeps other flags', () => {
    const code = `${IMPORT}qwikVite({ experimental: ['noSPA'] });`;
    expect(run(removeStableExperimentalFeatures, code)).toEqual({ changed: false, text: code });
  });
});
