import { Project } from 'ts-morph';
import { afterEach, describe, expect, test } from 'vitest';
import { takeWarnings } from '../report';
import type { Codemod } from './run-codemods';
import {
  keepAssetsDir,
  keepBaseOutDir,
  removeDevInput,
  removeStableExperimentalFeatures,
  warnManualChunks,
} from './vite-config';

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

describe('keepBaseOutDir', () => {
  afterEach(() => takeWarnings());

  test('adds the client outDir under the base', () => {
    expect(
      run(keepBaseOutDir, `${IMPORT}export default { base: '/app/', plugins: [qwikVite()] };`).text
    ).toBe(
      `${IMPORT}export default { base: '/app/', plugins: [qwikVite({ client: { outDir: 'dist/app' } })] };`
    );
  });

  test('merges into existing options', () => {
    expect(
      run(
        keepBaseOutDir,
        [
          IMPORT + `export default defineConfig(() => {`,
          `  return {`,
          `    base: '/a/b/',`,
          `    plugins: [`,
          `      qwikVite({`,
          `        debug: true,`,
          `      }),`,
          `    ],`,
          `  };`,
          `});`,
        ].join('\n')
      ).text
    ).toContain(`        debug: true,\n        client: { outDir: 'dist/a/b' },\n      }),`);
    expect(
      run(keepBaseOutDir, `${IMPORT}({ base: '/a/', p: qwikVite({ client: { input: 'x' } }) });`)
        .text
    ).toBe(
      `${IMPORT}({ base: '/a/', p: qwikVite({ client: { input: 'x', outDir: 'dist/a' } }) });`
    );
    expect(
      run(
        keepBaseOutDir,
        `${IMPORT}({ base: '/a/', p: qwikVite({ client: { outDir: 'out/' } }) });`
      ).text
    ).toBe(`${IMPORT}({ base: '/a/', p: qwikVite({ client: { outDir: 'out/a' } }) });`);
  });

  test('does nothing for the root base or without base', () => {
    for (const code of [
      `${IMPORT}({ base: '/', p: qwikVite() });`,
      `${IMPORT}({ p: qwikVite() });`,
    ]) {
      expect(run(keepBaseOutDir, code)).toEqual({ changed: false, text: code });
    }
  });

  test('warns when the base is not a literal', () => {
    run(keepBaseOutDir, `${IMPORT}({ base: process.env.BASE, p: qwikVite() });`);
    expect(takeWarnings()).toHaveLength(1);
  });
});

describe('keepAssetsDir', () => {
  afterEach(() => takeWarnings());

  test('moves the asset location to output.assetFileNames', () => {
    expect(run(keepAssetsDir, `export default { build: { assetsDir: 'static' } };`).text).toBe(
      `export default { build: { assetsDir: 'static', rolldownOptions: { output: { assetFileNames: 'static/assets/[hash]-[name].[ext]' } } } };`
    );
    expect(takeWarnings()).toEqual([
      '/vite.config.ts: v2 ignores `build.assetsDir`: assets are kept in "static/assets" but JS chunks are now emitted to "build/".',
    ]);
  });

  test('merges into existing rollupOptions output', () => {
    expect(
      run(
        keepAssetsDir,
        `export default { build: { assetsDir: 'static/', rollupOptions: { output: { preserveModules: true } } } };`
      ).text
    ).toBe(
      `export default { build: { assetsDir: 'static/', rollupOptions: { output: { preserveModules: true, assetFileNames: 'static/assets/[hash]-[name].[ext]' } } } };`
    );
    expect(
      run(
        keepAssetsDir,
        `export default { build: { assetsDir: 'a', rollupOptions: { input: 'x' } } };`
      ).text
    ).toBe(
      `export default { build: { assetsDir: 'a', rollupOptions: { input: 'x', output: { assetFileNames: 'a/assets/[hash]-[name].[ext]' } } } };`
    );
  });

  test('keeps an explicit assetFileNames and the default assetsDir', () => {
    for (const code of [
      `export default { build: { assetsDir: 'a', rollupOptions: { output: { assetFileNames: 'x' } } } };`,
      `export default { build: { assetsDir: 'assets' } };`,
      `export default { other: { assetsDir: 'a' } };`,
    ]) {
      expect(run(keepAssetsDir, code)).toEqual({ changed: false, text: code });
    }
  });
});

describe('warnManualChunks', () => {
  afterEach(() => takeWarnings());

  test('warns about manualChunks in any form', () => {
    for (const code of [
      `export default { build: { rollupOptions: { output: { manualChunks: { a: ['b'] } } } } };`,
      `export default { build: { rollupOptions: { output: { manualChunks(id) {} } } } };`,
      `const manualChunks = () => {};\nexport default { output: { manualChunks } };`,
    ]) {
      expect(run(warnManualChunks, code)).toEqual({ changed: false, text: code });
      expect(takeWarnings()).toHaveLength(1);
    }
  });

  test('does not warn without manualChunks', () => {
    run(warnManualChunks, `export default { build: {} };`);
    expect(takeWarnings()).toEqual([]);
  });
});
