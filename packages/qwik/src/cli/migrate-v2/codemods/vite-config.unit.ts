import { Project } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import type { Codemod } from './run-codemods';
import { removeDevInput } from './vite-config';

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
