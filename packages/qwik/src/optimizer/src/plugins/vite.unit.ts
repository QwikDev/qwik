import path, { resolve } from 'node:path';
import type { Rollup } from 'vite';
import { assert, describe, test } from 'vitest';
import { normalizePath } from '../../../testing/util';
import type { OptimizerOptions } from '../types';
import { qwikVite, type QwikVitePlugin, type QwikVitePluginOptions } from './vite';

const cwd = process.cwd();

const chunkInfoMocks = [
  {
    exports: [''],
    name: 'chunk.tsx',
    facadeModuleId: 'chunk.tsx',
    moduleIds: ['chunk.tsx'],
  },
  {
    exports: [''],
    name: cwd + '/app/chunk.tsx',
    facadeModuleId: cwd + '/app/chunk.tsx',
    moduleIds: [cwd + '/app/chunk.tsx'],
  },
] as Rollup.PreRenderedChunk[];

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
  '@qwik.dev/core',
  '@qwik.dev/core/internal',
  '@qwik.dev/core/server',
  '@qwik.dev/core/build',
];

const excludeDeps = [
  '@qwik.dev/core',
  '@qwik.dev/core/internal',
  '@qwik.dev/core/server',
  '@qwik.dev/core/jsx-runtime',
  '@qwik.dev/core/jsx-dev-runtime',
  '@qwik.dev/core/build',
  '@qwik-client-manifest',
  '@builder.io/qwik',
];

const getPlugin = (opts: QwikVitePluginOptions | undefined) =>
  (qwikVite(opts) as any)[0] as QwikVitePlugin;

// undefined for Vite 5 - 6, an object for Vite 7
const configHookPluginContext = undefined as any;

test('command: serve, mode: development', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = getPlugin(initOpts);
  const c = (await plugin.config.call(
    configHookPluginContext,
    {},
    { command: 'serve', mode: 'development' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions;
  const chunkFileNames = outputOptions.chunkFileNames as (
    chunkInfo: Rollup.PreRenderedChunk
  ) => string;
  const entryFileNames = outputOptions.entryFileNames as (
    chunkInfo: Rollup.PreRenderedChunk
  ) => string;

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'segment' });
  assert.deepEqual(opts.debug, false);

  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'root'))]);

  assert.deepEqual(outputOptions.assetFileNames, 'assets/[hash]-[name].[ext]');
  assert.deepEqual(chunkFileNames(chunkInfoMocks[0]), `build/chunk.tsx.js`);
  assert.deepEqual(entryFileNames(chunkInfoMocks[0]), `build/chunk.tsx.js`);
  const relDev = path.relative(cwd, chunkInfoMocks[1].name);
  const sanitizedDev = relDev
    .replace(/^\(\.\.\/\)+/, '')
    .replace(/^\/+/, '')
    .replace(/\//g, '-');
  const expectedDevChunk = `build/${sanitizedDev}.js`;
  assert.deepEqual(chunkFileNames(chunkInfoMocks[1]), expectedDevChunk);
  assert.deepEqual(entryFileNames(chunkInfoMocks[1]), expectedDevChunk);
  assert.deepEqual(outputOptions.format, 'es');

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
  const plugin = getPlugin(initOpts);
  const c = (await plugin.config.call(
    configHookPluginContext,
    {},
    { command: 'serve', mode: 'production' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions;

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'segment' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'root'))]);
  assert.deepEqual(outputOptions.assetFileNames, 'assets/[hash]-[name].[ext]');
  assert.deepEqual(outputOptions.chunkFileNames, 'build/q-[hash].js');
  assert.deepEqual(outputOptions.entryFileNames, 'build/q-[hash].js');
  assert.deepEqual(outputOptions.format, 'es');

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
  const plugin = getPlugin(initOpts);
  const c = (await plugin.config.call(
    configHookPluginContext,
    {},
    { command: 'build', mode: 'development' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions;
  const chunkFileNames = outputOptions.chunkFileNames as (
    chunkInfo: Rollup.PreRenderedChunk
  ) => string;
  const entryFileNames = outputOptions.entryFileNames as (
    chunkInfo: Rollup.PreRenderedChunk
  ) => string;

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'segment' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(plugin.enforce, 'pre');
  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual((rollupOptions.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'root')),
  ]);

  assert.deepEqual(outputOptions.assetFileNames, 'assets/[hash]-[name].[ext]');
  assert.deepEqual(chunkFileNames(chunkInfoMocks[0]), `build/chunk.tsx.js`);
  assert.deepEqual(entryFileNames(chunkInfoMocks[0]), `build/chunk.tsx.js`);
  const relBuildDev = path.relative(cwd, chunkInfoMocks[1].name);
  const sanitizedBuildDev = relBuildDev
    .replace(/^\(\.\.\/\)+/, '')
    .replace(/^\/+/, '')
    .replace(/\//g, '-');
  const expectedBuildDevChunk = `build/${sanitizedBuildDev}.js`;
  assert.deepEqual(chunkFileNames(chunkInfoMocks[1]), expectedBuildDevChunk);
  assert.deepEqual(entryFileNames(chunkInfoMocks[1]), expectedBuildDevChunk);

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
  const plugin = getPlugin(initOpts);
  const c = (await plugin.config.call(
    configHookPluginContext,
    {},
    { command: 'build', mode: 'production' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions;

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'smart' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(plugin.enforce, 'pre');
  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual((rollupOptions.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'root')),
  ]);

  assert.deepEqual(outputOptions.assetFileNames, 'assets/[hash]-[name].[ext]');
  assert.deepEqual(outputOptions.chunkFileNames, 'build/q-[hash].js');
  assert.deepEqual(outputOptions.entryFileNames, 'build/q-[hash].js');

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

  const plugin = getPlugin(initOpts);
  const c: any = (await plugin.config.call(
    configHookPluginContext,
    {},
    { command: 'build', mode: 'production' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual((rollupOptions.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'root')),
  ]);
  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'client-dist')));
  assert.deepEqual(build.emptyOutDir, undefined);
});

test('command: build, --ssr entry.server.tsx', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = getPlugin(initOpts);
  const c = (await plugin.config.call(
    configHookPluginContext,
    { build: { ssr: resolve(cwd, 'src', 'entry.server.tsx') } },
    { command: 'build', mode: '' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions;

  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(plugin.enforce, 'pre');
  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'server')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual((rollupOptions.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'entry.server.tsx')),
  ]);

  assert.deepEqual(outputOptions.assetFileNames, 'assets/[hash]-[name].[ext]');
  assert.isFunction(outputOptions.chunkFileNames);
  assert.deepEqual((outputOptions.chunkFileNames as any)({ name: 'hello' }), 'build/hello.js');
  assert.deepEqual(outputOptions.entryFileNames, undefined);

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
  const plugin = getPlugin(initOpts);
  const c: any = (await plugin.config.call(
    configHookPluginContext,
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
  assert.deepEqual((rollupOptions.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'renderz.tsx')),
  ]);
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
  const plugin = getPlugin(initOpts);
  const c: any = (await plugin.config.call(
    configHookPluginContext,
    { build: { emptyOutDir: true, assetsDir: 'my-assets-dir' } },
    { command: 'serve', mode: 'ssr' }
  ))!;
  const opts = plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;

  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(build.minify, undefined);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual((rollupOptions.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'renderz.tsx')),
  ]);
  assert.deepEqual(c.build.outDir, normalizePath(resolve(cwd, 'ssr-dist')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual(c.publicDir, undefined);
  assert.deepEqual(opts.resolveQwikBuild, true);
});

test('should use the dist/ fallback with client target', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = getPlugin(initOpts);
  const c: any = (await plugin.config.call(
    configHookPluginContext,
    { build: { assetsDir: 'my-assets-dir/' } },
    { command: 'serve', mode: 'development' }
  ))!;

  assert.equal(c.build.outDir, normalizePath(resolve(cwd, `dist`)));
});

test('should use build.outDir config with client target', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = getPlugin(initOpts);
  const c: any = (await plugin.config.call(
    configHookPluginContext,
    { build: { outDir: 'my-dist/', assetsDir: 'my-assets-dir' } },
    { command: 'serve', mode: 'development' }
  ))!;

  assert.equal(c.build.outDir, normalizePath(resolve(cwd, `my-dist`)));
});

test('should use build.outDir config when assetsDir is _astro', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };

  const plugin = getPlugin(initOpts);

  // Astro sets a build.assetsDir of _astro, but we don't want to change that
  const c: any = (await plugin.config.call(
    configHookPluginContext,
    { build: { assetsDir: '_astro' } },
    { command: 'serve', mode: 'development' }
  ))!;

  assert.equal(c.build.outDir, normalizePath(resolve(cwd, `dist/`)));
});

test('command: build, --mode lib', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = getPlugin(initOpts);
  const c: any = (await plugin.config.call(
    configHookPluginContext,
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
  const outputOptions = rollupOptions.output as Rollup.OutputOptions;

  assert.deepEqual(opts.target, 'lib');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(build.minify, false);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual(rollupOptions.input, undefined);

  assert.deepEqual(outputOptions.assetFileNames, 'assets/[hash]-[name].[ext]');
  assert.isFunction(outputOptions.chunkFileNames);
  assert.deepEqual((outputOptions.chunkFileNames as any)({ name: 'hello' }), 'build/hello.js');

  assert.deepEqual(c.build.outDir, normalizePath(resolve(cwd, 'lib')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual(opts.resolveQwikBuild, true);
});

test('command: build, --mode lib with multiple outputs', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = getPlugin(initOpts);
  const c: any = (await plugin.config.call(
    configHookPluginContext,
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
  assert.deepEqual(rollupOptions.input, undefined);

  assert.ok(Array.isArray(outputOptions));
  assert.lengthOf(outputOptions, 4);

  outputOptions.forEach((outputOptionsObj) => {
    assert.deepEqual(outputOptionsObj.assetFileNames, 'assets/[hash]-[name].[ext]');
    assert.isFunction(outputOptionsObj.chunkFileNames);
    assert.deepEqual((outputOptionsObj.chunkFileNames as any)({ name: 'hello' }), 'build/hello.js');
  });

  assert.deepEqual(c.build.outDir, normalizePath(resolve(cwd, 'lib')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual(opts.resolveQwikBuild, true);
});

describe('input config', () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    client: {
      input: './src/widget/counter.tsx',
      outDir: './dist/client',
    },
    ssr: {
      input: './src/widget/ssr.tsx',
      outDir: './dist/server',
    },
  } as QwikVitePluginOptions;
  test('should handle client target', async () => {
    const plugin = getPlugin(initOpts);
    const c: any = (await plugin.config.call(
      configHookPluginContext,
      {},
      { command: 'build', mode: 'development' }
    ))!;
    assert.deepEqual(c.build.rollupOptions.input, ['./src/widget/counter.tsx']);
  });
  test('should handle ssr target', async () => {
    const plugin = getPlugin(initOpts);
    const c: any = (await plugin.config.call(
      configHookPluginContext,
      {},
      { command: 'build', mode: 'ssr' }
    ))!;
    assert.deepEqual(c.build.rollupOptions.input, ['./src/widget/ssr.tsx']);
  });
});
