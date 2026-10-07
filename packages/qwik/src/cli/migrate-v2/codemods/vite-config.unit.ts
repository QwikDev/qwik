import { mkdirSync, symlinkSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import { takeWarnings } from '../report';
import { createTmpProject } from '../tools/tmp-project';
import { createProject, type Codemod } from './run-codemods';
import {
  bundleV1Libraries,
  keepAssetsDir,
  keepBaseOutDir,
  removeDevInput,
  removeStableExperimentalFeatures,
  warnManualChunks,
} from './vite-config';

const run = (codemod: Codemod, code: string) => {
  const file = createProject({ useInMemoryFileSystem: true }).createSourceFile(
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

describe('bundleV1Libraries', () => {
  let project: ReturnType<typeof createTmpProject>;
  afterEach(() => {
    project.cleanup();
    takeWarnings();
  });

  const pkg = (json: object) => JSON.stringify(json);
  const V2_IMPORT = `import { qwikVite } from '@qwik.dev/core/optimizer';\n`;
  const LIBRARIES = {
    'package.json': pkg({
      dependencies: { 'v1-lib': '1', 'v2-lib': '1', 'not-installed': '1' },
      devDependencies: { '@builder.io/qwik-city': '1', '@scope/v1-dev-lib': '1', plain: '1' },
    }),
    'node_modules/v1-lib/package.json': pkg({ peerDependencies: { '@builder.io/qwik': '^1' } }),
    'node_modules/v2-lib/package.json': pkg({ peerDependencies: { '@qwik.dev/core': '^2' } }),
    'node_modules/@builder.io/qwik-city/package.json': pkg({
      peerDependencies: { '@builder.io/qwik': '^1' },
    }),
    'node_modules/@scope/v1-dev-lib/package.json': pkg({
      dependencies: { '@builder.io/qwik': '^1' },
    }),
    'node_modules/plain/package.json': pkg({}),
  };

  /** Runs the codemod on the project's vite.config.ts, from disk. */
  const runOnConfig = () => {
    const file = createProject().addSourceFileAtPath(join(project.dir, 'vite.config.ts'));
    const changed = bundleV1Libraries(file);
    return { changed, text: file.getFullText() };
  };

  test('adds the installed v1 libraries to resolve.noExternal once', () => {
    project = createTmpProject({
      ...LIBRARIES,
      'vite.config.ts': `${V2_IMPORT}export default defineConfig(() => {\n  return {\n    plugins: [qwikVite()],\n  };\n});`,
    });
    const expected = `${V2_IMPORT}export default defineConfig(() => {\n  return {\n    plugins: [qwikVite()],\n    resolve: { noExternal: ['v1-lib', '@scope/v1-dev-lib'] },\n  };\n});`;
    expect(runOnConfig()).toEqual({ changed: true, text: expected });
    expect(takeWarnings()).toEqual([
      expect.stringContaining('added "v1-lib", "@scope/v1-dev-lib" to `resolve.noExternal`'),
    ]);
    project.write('vite.config.ts', expected);
    expect(runOnConfig()).toEqual({ changed: false, text: expected });
  });

  test('adds the missing libraries to an existing resolve.noExternal', () => {
    project = createTmpProject({
      ...LIBRARIES,
      'vite.config.ts': `${IMPORT}export default { plugins: [qwikVite()], resolve: { alias: {}, noExternal: ['v1-lib'] } };`,
    });
    expect(runOnConfig().text).toBe(
      `${IMPORT}export default { plugins: [qwikVite()], resolve: { alias: {}, noExternal: ['v1-lib', '@scope/v1-dev-lib'] } };`
    );
  });

  test('keeps resolve.noExternal: true', () => {
    const code = `${IMPORT}export default { plugins: [qwikVite()], resolve: { noExternal: true } };`;
    project = createTmpProject({ ...LIBRARIES, 'vite.config.ts': code });
    expect(runOnConfig()).toEqual({ changed: false, text: code });
  });

  test('warns when it cannot edit resolve.noExternal', () => {
    const code = `${IMPORT}const plugins = [qwikVite()];\nexport default { plugins };`;
    project = createTmpProject({ ...LIBRARIES, 'vite.config.ts': code });
    expect(runOnConfig()).toEqual({ changed: false, text: code });
    expect(takeWarnings()).toEqual([
      expect.stringContaining('add "v1-lib", "@scope/v1-dev-lib" to `resolve.noExternal`'),
    ]);
  });

  test('skips workspace packages, the migration updates them too', () => {
    const code = `${IMPORT}export default { plugins: [qwikVite()] };`;
    project = createTmpProject({
      'package.json': pkg({ dependencies: { 'workspace-lib': '*' } }),
      'packages/workspace-lib/package.json': pkg({ dependencies: { '@builder.io/qwik': '1' } }),
      'vite.config.ts': code,
    });
    mkdirSync(join(project.dir, 'node_modules'));
    symlinkSync(
      join(project.dir, 'packages/workspace-lib'),
      join(project.dir, 'node_modules/workspace-lib'),
      'junction'
    );
    expect(runOnConfig()).toEqual({ changed: false, text: code });
  });
});
