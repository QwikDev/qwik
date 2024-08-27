import path, { resolve } from 'node:path';
import type { Rollup } from 'vite';
import { assert, expect, suite, test } from 'vitest';
import { normalizePath } from '../../../testing/util';
import type { OptimizerOptions, QwikBundle, QwikManifest } from '../types';
import { convertManifestToBundleGraph, qwikVite } from './vite';

const cwd = process.cwd();

function mockOptimizerOptions(): OptimizerOptions {
  return {
    sys: {
      cwd: () => process.cwd(),
      env: 'node',
      os: process.platform,
      dynamicImport: async (path) => import(path),
      strictDynamicImport: async (path) => import(path),
      path: path as any,
    },
    binding: { mockBinding: true },
  };
}

const includeDeps = undefined;
const noExternal = [
  '@builder.io/qwik',
  '@builder.io/qwik/server',
  '@builder.io/qwik/build',
  '@builder.io/qwik-city',
];

const excludeDeps = [
  '@vite/client',
  '@vite/env',
  'node-fetch',
  'undici',
  '@builder.io/qwik',
  '@builder.io/qwik/server',
  '@builder.io/qwik/jsx-runtime',
  '@builder.io/qwik/jsx-dev-runtime',
  '@builder.io/qwik/build',
  '@qwik-client-manifest',
  '@builder.io/qwik-city',
];

test('command: serve, mode: development', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts)[0];
  const c = (await plugin.config({}, { command: 'serve', mode: 'development' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions[];

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hook' });
  assert.deepEqual(opts.debug, false);

  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(rollupOptions.input, normalizePath(resolve(cwd, 'src', 'entry.dev')));

  assert.ok(Array.isArray(outputOptions));
  assert.lengthOf(outputOptions, 1);

  outputOptions.forEach((outputOptionsObj) => {
    assert.deepEqual(outputOptionsObj.assetFileNames, 'build/q-[hash].[ext]');
    assert.deepEqual(outputOptionsObj.chunkFileNames, 'build/[name].js');
    assert.deepEqual(outputOptionsObj.entryFileNames, 'build/[name].js');
    assert.deepEqual(outputOptionsObj.format, 'es');
  });

  assert.deepEqual(build.dynamicImportVarsOptions?.exclude, [/./]);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual(c.optimizeDeps?.include, includeDeps);
  assert.deepEqual(c.optimizeDeps?.exclude, excludeDeps);

  assert.deepEqual(c.esbuild, false);
  assert.deepEqual(c.ssr, {
    noExternal,
  });
});

test('command: serve, mode: production', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts)[0];
  const c = (await plugin.config({}, { command: 'serve', mode: 'production' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions[];

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'hook' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual(rollupOptions.input, normalizePath(resolve(cwd, 'src', 'entry.dev')));

  assert.ok(Array.isArray(outputOptions));
  assert.lengthOf(outputOptions, 1);

  outputOptions.forEach((outputOptionsObj) => {
    assert.deepEqual(outputOptionsObj.assetFileNames, 'build/q-[hash].[ext]');
    assert.deepEqual(outputOptionsObj.chunkFileNames, 'build/q-[hash].js');
    assert.deepEqual(outputOptionsObj.entryFileNames, 'build/q-[hash].js');
    assert.deepEqual(outputOptionsObj.format, 'es');
  });

  assert.deepEqual(build.dynamicImportVarsOptions?.exclude, [/./]);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual(c.optimizeDeps?.include, includeDeps);
  assert.deepEqual(c.optimizeDeps?.exclude, excludeDeps);
  assert.deepEqual(c.esbuild, false);
  assert.deepEqual(c.ssr, {
    noExternal,
  });
});

test('command: build, mode: development', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts)[0];
  const c = (await plugin.config({}, { command: 'build', mode: 'development' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions[];

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hook' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(plugin.enforce, 'pre');
  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'root'))]);

  assert.ok(Array.isArray(outputOptions));
  assert.lengthOf(outputOptions, 1);

  outputOptions.forEach((outputOptionsObj) => {
    assert.deepEqual(outputOptionsObj.assetFileNames, 'build/q-[hash].[ext]');
    assert.deepEqual(outputOptionsObj.chunkFileNames, 'build/[name].js');
    assert.deepEqual(outputOptionsObj.entryFileNames, 'build/[name].js');
  });

  assert.deepEqual(build.dynamicImportVarsOptions?.exclude, [/./]);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual(c.optimizeDeps?.include, includeDeps);
  assert.deepEqual(c.optimizeDeps?.exclude, excludeDeps);
  assert.deepEqual(c.esbuild, {
    logLevel: 'error',
    jsx: 'automatic',
  });
  assert.deepEqual(c.ssr, {
    noExternal,
  });
});

test('command: build, mode: production', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts)[0];
  const c = (await plugin.config({}, { command: 'build', mode: 'production' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions[];

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'smart' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(plugin.enforce, 'pre');
  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'root'))]);

  assert.ok(Array.isArray(outputOptions));
  assert.lengthOf(outputOptions, 1);

  outputOptions.forEach((outputOptionsObj) => {
    assert.deepEqual(outputOptionsObj.assetFileNames, 'build/q-[hash].[ext]');
    assert.deepEqual(outputOptionsObj.chunkFileNames, 'build/q-[hash].js');
    assert.deepEqual(outputOptionsObj.entryFileNames, 'build/q-[hash].js');
  });

  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(build.dynamicImportVarsOptions?.exclude, [/./]);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual(c.optimizeDeps?.include, includeDeps);
  assert.deepEqual(c.optimizeDeps?.exclude, excludeDeps);
  assert.deepEqual(c.esbuild, {
    logLevel: 'error',
    jsx: 'automatic',
  });
  assert.deepEqual(c.ssr, {
    noExternal,
  });
});

test('command: build, --mode production (client)', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    client: {
      devInput: resolve(cwd, 'src', 'dev.entry.tsx'),
      outDir: resolve(cwd, 'client-dist'),
    },
  };

  const plugin = qwikVite(initOpts)[0];
  const c: any = (await plugin.config({}, { command: 'build', mode: 'production' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'root'))]);
  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'client-dist')));
  assert.deepEqual(build.emptyOutDir, undefined);
});

test('command: build, --ssr entry.server.tsx', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts)[0];
  const c = (await plugin.config(
    { build: { ssr: resolve(cwd, 'src', 'entry.server.tsx') } },
    { command: 'build', mode: '' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions[];

  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(plugin.enforce, 'pre');
  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'server')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'entry.server.tsx'))]);

  assert.ok(Array.isArray(outputOptions));
  assert.lengthOf(outputOptions, 1);

  outputOptions.forEach((outputOptionsObj) => {
    assert.deepEqual(outputOptionsObj.assetFileNames, 'build/q-[hash].[ext]');
    assert.deepEqual(outputOptionsObj.chunkFileNames, undefined);
    assert.deepEqual(outputOptionsObj.entryFileNames, undefined);
  });

  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'server')));
  assert.deepEqual(build.dynamicImportVarsOptions?.exclude, [/./]);
  assert.deepEqual(build.ssr, true);
  assert.deepEqual(c.optimizeDeps?.include, includeDeps);
  assert.deepEqual(c.optimizeDeps?.exclude, excludeDeps);
  assert.deepEqual(c.esbuild, {
    logLevel: 'error',
    jsx: 'automatic',
  });
  assert.deepEqual(c.publicDir, false);
});

test('command: serve, --mode ssr', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    ssr: {
      input: resolve(cwd, 'src', 'renderz.tsx'),
      outDir: resolve(cwd, 'ssr-dist'),
    },
  };
  const plugin = qwikVite(initOpts)[0];
  const c: any = (await plugin.config(
    { build: { emptyOutDir: true } },
    { command: 'serve', mode: 'ssr' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;

  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(build.minify, undefined);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'renderz.tsx'))]);
  assert.deepEqual(c.build.outDir, normalizePath(resolve(cwd, 'ssr-dist')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual(c.publicDir, undefined);
  assert.deepEqual(opts.resolveQwikBuild, true);
});

test('command: serve, --mode ssr with build.assetsDir', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    ssr: {
      input: resolve(cwd, 'src', 'renderz.tsx'),
      outDir: resolve(cwd, 'ssr-dist'),
    },
  };
  const plugin = qwikVite(initOpts)[0];
  const c: any = (await plugin.config(
    { build: { emptyOutDir: true, assetsDir: 'my-assets-dir' } },
    { command: 'serve', mode: 'ssr' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;

  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(build.minify, undefined);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'renderz.tsx'))]);
  assert.deepEqual(c.build.outDir, normalizePath(resolve(cwd, 'ssr-dist')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual(c.publicDir, undefined);
  assert.deepEqual(opts.resolveQwikBuild, true);
});

test('should use the dist/ fallback with client target', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts)[0];
  const c: any = (await plugin.config(
    { build: { assetsDir: 'my-assets-dir/' } },
    { command: 'serve' }
  ))!;

  assert.equal(c.build.outDir, normalizePath(resolve(cwd, `dist`)));
});

test('should use build.outDir config with client target', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts)[0];
  const c: any = (await plugin.config(
    { build: { outDir: 'my-dist/', assetsDir: 'my-assets-dir' } },
    { command: 'serve' }
  ))!;

  assert.equal(c.build.outDir, normalizePath(resolve(cwd, `my-dist`)));
});

test('should use build.outDir config when assetsDir is _astro', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };

  const plugin = qwikVite(initOpts)[0];

  // Astro sets a build.assetsDir of _astro, but we don't want to change that
  const c: any = (await plugin.config({ build: { assetsDir: '_astro' } }, { command: 'serve' }))!;

  assert.equal(c.build.outDir, normalizePath(resolve(cwd, `dist/`)));
});

test('command: build, --mode lib', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts)[0];
  const c: any = (await plugin.config(
    {
      build: {
        lib: {
          entry: './src/index.ts',
          formats: ['es', 'cjs'],
        },
      },
    },
    { command: 'build', mode: 'lib' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions[];

  assert.deepEqual(opts.target, 'lib');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(build.minify, false);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'index.ts'))]);

  assert.ok(Array.isArray(outputOptions));
  assert.lengthOf(outputOptions, 1);

  outputOptions.forEach((outputOptionsObj) => {
    assert.deepEqual(outputOptionsObj.assetFileNames, 'build/q-[hash].[ext]');
    assert.deepEqual(outputOptionsObj.chunkFileNames, undefined);
  });

  assert.deepEqual(c.build.outDir, normalizePath(resolve(cwd, 'lib')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual(opts.resolveQwikBuild, true);
});

test('command: build, --mode lib with multiple outputs', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts)[0];
  const c: any = (await plugin.config(
    {
      build: {
        lib: {
          entry: './src/index.ts',
        },
        rollupOptions: {
          output: [
            {
              format: 'es',
              entryFileNames: 'index.esm.js',
            },
            {
              format: 'es',
              entryFileNames: 'index.mjs',
            },
            {
              format: 'cjs',
              entryFileNames: 'index.cjs.js',
            },
            {
              format: 'cjs',
              entryFileNames: 'index.cjs',
            },
          ],
        },
      },
    },
    { command: 'build', mode: 'lib' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions[];

  assert.deepEqual(opts.target, 'lib');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(build.minify, false);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'index.ts'))]);

  assert.ok(Array.isArray(outputOptions));
  assert.lengthOf(outputOptions, 4);

  outputOptions.forEach((outputOptionsObj) => {
    assert.deepEqual(outputOptionsObj.assetFileNames, 'build/q-[hash].[ext]');
    assert.deepEqual(outputOptionsObj.chunkFileNames, undefined);
  });

  assert.deepEqual(c.build.outDir, normalizePath(resolve(cwd, 'lib')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual(opts.resolveQwikBuild, true);
});

suite('convertManifestToBundleGraph', () => {
  test('empty', () => {
    expect(convertManifestToBundleGraph({} as any)).toEqual([]);
  });

  test('simple file set', () => {
    const manifest = {
      bundles: {
        'a.js': {
          size: 0,
          imports: ['b.js'],
          dynamicImports: ['c.js'],
        },
        'b.js': {
          size: 0,
          dynamicImports: ['c.js'],
        },
        'c.js': {
          size: 0,
        },
      } as Record<string, QwikBundle>,
    } as QwikManifest;
    expect(convertManifestToBundleGraph(manifest)).toEqual(['a.js', 3, 5, 'b.js', 5, 'c.js']);
  });
});
