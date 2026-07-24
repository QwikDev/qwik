import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { resolve } from 'node:path';
import { resolveConfig, type Rolldown } from 'vite';
import { assert, describe, test } from 'vitest';
import { normalizePath } from '../../../qwik/src/testing/util';
import type { OptimizerOptions } from '../types';
import { isSameClassMap, qwikVite, type QwikVitePlugin, type QwikVitePluginOptions } from './vite';
import { flattenToChunkName } from './vite-utils';
import {
  createBuildWorkerCoreChunkResolver,
  createBuildWorkerQrlChunkResolver,
  createDevWorkerQrlChunkResolver,
  createRelativeBuildWorkerQrlChunkResolver,
  QWIK_WORKER_CORE_SENTINEL,
  QWIK_WORKER_QRL_SENTINEL,
  rewriteWorkerCorePlaceholders,
  rewriteWorkerQrlChunkPlaceholders,
} from './worker-qrl-chunks';

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
] as Rolldown.PreRenderedChunk[];

function mockOptimizerOptions(env: 'node' | 'deno' = 'node'): OptimizerOptions {
  return {
    sys: {
      cwd: () => process.cwd(),
      env,
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
  const rolldownOptions = build!.rolldownOptions!;
  const outputOptions = rolldownOptions.output as Rolldown.OutputOptions;
  const chunkFileNames = outputOptions.chunkFileNames as (
    chunkInfo: Rolldown.PreRenderedChunk
  ) => string;
  const entryFileNames = outputOptions.entryFileNames as (
    chunkInfo: Rolldown.PreRenderedChunk
  ) => string;

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'segment' });
  assert.deepEqual(opts.debug, false);

  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(rolldownOptions.input, [normalizePath(resolve(cwd, 'src', 'root'))]);

  assert.deepEqual(outputOptions.assetFileNames, 'assets/[hash]-[name].[ext]');
  assert.deepEqual(chunkFileNames(chunkInfoMocks[0]), `build/chunk.tsx.js`);
  assert.deepEqual(entryFileNames(chunkInfoMocks[0]), `build/chunk.tsx.js`);
  const expectedDevChunk = `build/${flattenToChunkName(path.relative(cwd, chunkInfoMocks[1].name))}.js`;
  assert.deepEqual(chunkFileNames(chunkInfoMocks[1]), expectedDevChunk);
  assert.deepEqual(entryFileNames(chunkInfoMocks[1]), expectedDevChunk);
  assert.deepEqual(outputOptions.format, 'es');

  assert.deepEqual(build.dynamicImportVarsOptions?.exclude, [/./]);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual(c.optimizeDeps?.include, includeDeps);
  assert.deepEqual(c.optimizeDeps?.exclude, excludeDeps);

  assert.deepEqual(c.ssr?.noExternal, noExternal);
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
  const rolldownOptions = build!.rolldownOptions!;
  const outputOptions = rolldownOptions.output as Rolldown.OutputOptions;

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'segment' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual(rolldownOptions.input, [normalizePath(resolve(cwd, 'src', 'root'))]);
  assert.deepEqual(outputOptions.assetFileNames, 'assets/[hash]-[name].[ext]');
  assert.deepEqual(outputOptions.chunkFileNames, 'build/q-[hash].js');
  assert.deepEqual(outputOptions.entryFileNames, 'build/q-[hash].js');
  assert.deepEqual(outputOptions.format, 'es');

  assert.deepEqual(build.dynamicImportVarsOptions?.exclude, [/./]);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual(c.optimizeDeps?.include, includeDeps);
  assert.deepEqual(c.optimizeDeps?.exclude, excludeDeps);
  assert.deepEqual(c.ssr?.noExternal, noExternal);
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
  const rolldownOptions = build!.rolldownOptions!;
  const outputOptions = rolldownOptions.output as Rolldown.OutputOptions;
  const chunkFileNames = outputOptions.chunkFileNames as (
    chunkInfo: Rolldown.PreRenderedChunk
  ) => string;
  const entryFileNames = outputOptions.entryFileNames as (
    chunkInfo: Rolldown.PreRenderedChunk
  ) => string;

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'segment' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(plugin.enforce, 'pre');
  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual((rolldownOptions.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'root')),
  ]);

  assert.deepEqual(outputOptions.assetFileNames, 'assets/[hash]-[name].[ext]');
  assert.deepEqual(chunkFileNames(chunkInfoMocks[0]), `build/chunk.tsx.js`);
  assert.deepEqual(entryFileNames(chunkInfoMocks[0]), `build/chunk.tsx.js`);
  const expectedBuildDevChunk = `build/${flattenToChunkName(path.relative(cwd, chunkInfoMocks[1].name))}.js`;
  assert.deepEqual(chunkFileNames(chunkInfoMocks[1]), expectedBuildDevChunk);
  assert.deepEqual(entryFileNames(chunkInfoMocks[1]), expectedBuildDevChunk);

  assert.deepEqual(build.dynamicImportVarsOptions?.exclude, [/./]);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual(c.optimizeDeps?.include, includeDeps);
  assert.deepEqual(c.optimizeDeps?.exclude, excludeDeps);
  assert.deepEqual(c.ssr?.noExternal, noExternal);
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
  const rolldownOptions = build!.rolldownOptions!;
  const outputOptions = rolldownOptions.output as Rolldown.OutputOptions;

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'smart' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(plugin.enforce, 'pre');
  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual((rolldownOptions.input as string[]).map(normalizePath), [
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
  assert.deepEqual(c.ssr?.noExternal, noExternal);
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
  const rolldownOptions = build!.rolldownOptions!;
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual((rolldownOptions.input as string[]).map(normalizePath), [
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
  const rolldownOptions = build!.rolldownOptions!;
  const outputOptions = rolldownOptions.output as Rolldown.OutputOptions;

  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.resolveQwikBuild, true);

  assert.deepEqual(plugin.enforce, 'pre');
  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'server')));
  assert.deepEqual(build.emptyOutDir, undefined);
  assert.deepEqual((rolldownOptions.input as string[]).map(normalizePath), [
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
  const rolldownOptions = build!.rolldownOptions!;

  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(build.minify, undefined);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual((rolldownOptions.input as string[]).map(normalizePath), [
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
  const rolldownOptions = build!.rolldownOptions!;

  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(build.minify, undefined);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual((rolldownOptions.input as string[]).map(normalizePath), [
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
    { build: {} },
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
    { build: { outDir: 'my-dist/' } },
    { command: 'serve', mode: 'development' }
  ))!;

  assert.equal(c.build.outDir, normalizePath(resolve(cwd, `my-dist`)));
});

test('build.assetsDir is ignored: it no longer relocates Qwik output', async () => {
  const plugin = getPlugin({ optimizerOptions: mockOptimizerOptions() });
  const c: any = (await plugin.config.call(
    configHookPluginContext,
    { build: { assetsDir: 'q' } },
    { command: 'build', mode: 'production' }
  ))!;
  const outputOptions = c.build.rolldownOptions.output as Rolldown.OutputOptions;
  // assets stay at the default dir and chunks stay at build/ — assetsDir has no effect on Qwik output
  assert.deepEqual(outputOptions.assetFileNames, 'assets/[hash]-[name].[ext]');
  assert.deepEqual(outputOptions.chunkFileNames, 'build/q-[hash].js');
});

test('user output.assetFileNames relocates assets but keeps chunks at build/', async () => {
  const plugin = getPlugin({ optimizerOptions: mockOptimizerOptions() });
  const c: any = (await plugin.config.call(
    configHookPluginContext,
    {
      build: { rolldownOptions: { output: { assetFileNames: 'q/assets/[hash]-[name][extname]' } } },
    },
    { command: 'build', mode: 'production' }
  ))!;
  const outputOptions = c.build.rolldownOptions.output as Rolldown.OutputOptions;
  assert.deepEqual(outputOptions.assetFileNames, 'q/assets/[hash]-[name][extname]');
  assert.deepEqual(outputOptions.chunkFileNames, 'build/q-[hash].js');
  assert.deepEqual(outputOptions.entryFileNames, 'build/q-[hash].js');
});

test('user output.assetFileNames also applies to the SSR build (client/SSR stay in sync)', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    ssr: {
      input: resolve(cwd, 'src', 'entry.ssr.tsx'),
      outDir: resolve(cwd, 'server'),
    },
  };
  const plugin = getPlugin(initOpts);
  const c: any = (await plugin.config.call(
    configHookPluginContext,
    {
      build: { rolldownOptions: { output: { assetFileNames: 'q/assets/[hash]-[name][extname]' } } },
    },
    { command: 'serve', mode: 'ssr' }
  ))!;
  const outputOptions = c.build.rolldownOptions.output as Rolldown.OutputOptions;
  assert.deepEqual(outputOptions.assetFileNames, 'q/assets/[hash]-[name][extname]');
});

test('command: build, mode: production (deno)', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions('deno'),
  };
  const plugin = getPlugin(initOpts);
  const c = (await plugin.config.call(
    configHookPluginContext,
    {},
    { command: 'build', mode: 'production' }
  ))!;
  const opts = await plugin.api?.getOptions();

  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.resolveQwikBuild, true);

  // Deno should produce the same config shape as Node
  const build = c.build!;
  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(build.dynamicImportVarsOptions?.exclude, [/./]);
  assert.deepEqual(build.ssr, undefined);
});

test('command: build, --ssr entry.server.tsx (deno)', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions('deno'),
  };
  const plugin = getPlugin(initOpts);
  const c = (await plugin.config.call(
    configHookPluginContext,
    { build: { ssr: resolve(cwd, 'src', 'entry.server.tsx') } },
    { command: 'build', mode: '' }
  ))!;
  const opts = await plugin.api?.getOptions();

  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });

  const build = c.build!;
  assert.deepEqual(build.outDir, normalizePath(resolve(cwd, 'server')));
  assert.deepEqual(build.ssr, true);
  assert.deepEqual(c.publicDir, false);
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
  const rolldownOptions = build!.rolldownOptions!;
  const outputOptions = rolldownOptions.output as Rolldown.OutputOptions;

  assert.deepEqual(opts.target, 'lib');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(build.minify, false);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual(rolldownOptions.input, undefined);

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
        rolldownOptions: {
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
  const rolldownOptions = build!.rolldownOptions!;
  const outputOptions = rolldownOptions.output as Rolldown.OutputOptions[];

  assert.deepEqual(opts.target, 'lib');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(build.minify, false);
  assert.deepEqual(build.ssr, undefined);
  assert.deepEqual(rolldownOptions.input, undefined);

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
    assert.deepEqual(c.build.rolldownOptions.input, ['./src/widget/counter.tsx']);
  });
  test('should handle ssr target', async () => {
    const plugin = getPlugin(initOpts);
    const c: any = (await plugin.config.call(
      configHookPluginContext,
      {},
      { command: 'build', mode: 'ssr' }
    ))!;
    assert.deepEqual(c.build.rolldownOptions.input, ['./src/widget/ssr.tsx']);
  });
});

describe('clientPublicOutDir', () => {
  test('clientPublicOutDir should equal clientOutDir when base is set', async () => {
    const initOpts = {
      optimizerOptions: mockOptimizerOptions(),
    };
    const plugin = getPlugin(initOpts);

    // Simulate a config with a base path that might cause duplication
    const viteConfig = {
      base: '/frameworks/keyed/qwik2/',
      build: {
        outDir: 'dist',
      },
    };

    await plugin.config.call(configHookPluginContext, viteConfig, {
      command: 'build',
      mode: 'production',
    });

    const clientOutDir = plugin.api.getClientOutDir();
    const clientPublicOutDir = plugin.api.getClientPublicOutDir();

    // clientPublicOutDir should be the same as clientOutDir
    // The base path should NOT be appended to the filesystem path
    assert.equal(clientPublicOutDir, clientOutDir);
  });

  test('clientPublicOutDir should equal clientOutDir without base', async () => {
    const initOpts = {
      optimizerOptions: mockOptimizerOptions(),
    };
    const plugin = getPlugin(initOpts);

    const viteConfig = {
      build: {
        outDir: 'dist',
      },
    };

    await plugin.config.call(configHookPluginContext, viteConfig, {
      command: 'build',
      mode: 'production',
    });

    const clientOutDir = plugin.api.getClientOutDir();
    const clientPublicOutDir = plugin.api.getClientPublicOutDir();

    assert.equal(clientPublicOutDir, clientOutDir);
  });

  test('clientPublicOutDir should equal clientOutDir with base="/"', async () => {
    const initOpts = {
      optimizerOptions: mockOptimizerOptions(),
    };
    const plugin = getPlugin(initOpts);

    const viteConfig = {
      base: '/',
      build: {
        outDir: 'dist',
      },
    };

    await plugin.config.call(configHookPluginContext, viteConfig, {
      command: 'build',
      mode: 'production',
    });

    const clientOutDir = plugin.api.getClientOutDir();
    const clientPublicOutDir = plugin.api.getClientPublicOutDir();

    assert.equal(clientPublicOutDir, clientOutDir);
  });

  test('clientPublicOutDir should not duplicate custom outDir with nested base path', async () => {
    const initOpts = {
      optimizerOptions: mockOptimizerOptions(),
      client: {
        outDir: 'frameworks/keyed/qwik2/dist',
      },
    };
    const plugin = getPlugin(initOpts);

    const viteConfig = {
      base: '/frameworks/keyed/qwik2/',
      build: {
        outDir: 'frameworks/keyed/qwik2/dist',
      },
    };

    await plugin.config.call(configHookPluginContext, viteConfig, {
      command: 'build',
      mode: 'production',
    });

    const clientPublicOutDir = plugin.api.getClientPublicOutDir();

    // Should be the outDir, not outDir + base
    assert.equal(
      normalizePath(clientPublicOutDir!),
      normalizePath(resolve(cwd, 'frameworks/keyed/qwik2/dist'))
    );

    // Should NOT be duplicated like: frameworks/keyed/qwik2/dist/frameworks/keyed/qwik2
    assert.notMatch(clientPublicOutDir!, /frameworks.*frameworks/);
  });
});

describe('configEnvironment', () => {
  test('should set noExternal for server environments', async () => {
    const plugin = getPlugin({ optimizerOptions: mockOptimizerOptions() });
    // Initialize the plugin first
    await plugin.config.call(
      configHookPluginContext,
      {},
      { command: 'serve', mode: 'development' }
    );

    const hook = (plugin as any).configEnvironment;
    assert.isFunction(hook);

    const result = hook('ssr', { consumer: 'server' }, { command: 'serve', mode: 'development' });
    assert.deepEqual(result.resolve.noExternal, noExternal);
  });

  test('should set resolve conditions for client environments in production', async () => {
    const plugin = getPlugin({ optimizerOptions: mockOptimizerOptions() });
    await plugin.config.call(configHookPluginContext, {}, { command: 'build', mode: 'production' });

    const hook = (plugin as any).configEnvironment;
    const result = hook('client', { consumer: 'client' }, { command: 'build', mode: 'production' });
    assert.deepEqual(result.resolve.conditions, ['min']);
  });

  test('should return empty config for client environments in development', async () => {
    const plugin = getPlugin({ optimizerOptions: mockOptimizerOptions() });
    await plugin.config.call(
      configHookPluginContext,
      {},
      { command: 'serve', mode: 'development' }
    );

    const hook = (plugin as any).configEnvironment;
    const result = hook(
      'client',
      { consumer: 'client' },
      { command: 'serve', mode: 'development' }
    );
    // In development, we don't set conditions to avoid overriding adapter-provided conditions
    // (e.g. ['webworker', 'worker'] for edge adapters). Empty object is the correct result.
    assert.deepEqual(result, {});
  });
});

describe('worker qrl chunk rewrites', () => {
  const workerPlaceholderCode = (importPath: string) =>
    `const chunk = "${QWIK_WORKER_QRL_SENTINEL}${importPath}";`;

  test('rewrites worker chunk placeholders to dev served qrl urls', () => {
    const resolver = createDevWorkerQrlChunkResolver('/e2e/src/routes/worker/index.tsx');

    const code = workerPlaceholderCode('./index.tsx_incrementInWorker_worker_abcd.js');
    const rewritten = rewriteWorkerQrlChunkPlaceholders(code, resolver);

    assert.equal(
      rewritten,
      'const chunk = "/e2e/src/routes/worker/index.tsx_incrementInWorker_worker_abcd.js?worker_file&type=module";'
    );
  });

  test('rewrites worker chunk placeholders to dev served qrl urls with query suffixes', () => {
    const resolver = createDevWorkerQrlChunkResolver('/e2e/src/routes/worker/index.tsx');

    const code = workerPlaceholderCode('./index.tsx_incrementInWorker_worker_abcd.js?v=123');
    const rewritten = rewriteWorkerQrlChunkPlaceholders(code, resolver);

    assert.equal(
      rewritten,
      'const chunk = "/e2e/src/routes/worker/index.tsx_incrementInWorker_worker_abcd.js?worker_file&type=module&v=123";'
    );
  });

  test('rewrites worker chunk placeholders to final bundle files', () => {
    const resolver = createBuildWorkerQrlChunkResolver(
      {
        manifestHash: 'hash',
        version: '1',
        mapping: {
          workerSymbol: 'q-worker.js',
        },
        symbols: {
          workerSymbol: {
            canonicalFilename: 'index_worker_abcd',
            origin: 'src/routes/index.tsx',
            displayName: 'workerSymbol',
            hash: 'workerSymbol',
            ctxKind: 'function',
            ctxName: 'worker$',
            captures: false,
            parent: null,
            loc: [0, 0],
          },
        },
        bundles: {},
      },
      '/app/'
    );

    const code = workerPlaceholderCode('./index_worker_abcd.js');
    const rewritten = rewriteWorkerQrlChunkPlaceholders(code, resolver);

    assert.equal(rewritten, 'const chunk = "/app/build/q-worker.js";');
  });

  test('rewrites worker chunk placeholders to relative final bundle files', () => {
    const resolver = createRelativeBuildWorkerQrlChunkResolver({
      manifestHash: 'hash',
      version: '1',
      mapping: {
        workerSymbol: 'q-worker.js',
      },
      symbols: {
        workerSymbol: {
          canonicalFilename: 'index_worker_abcd',
          origin: 'src/routes/index.tsx',
          displayName: 'workerSymbol',
          hash: 'workerSymbol',
          ctxKind: 'function',
          ctxName: 'worker$',
          captures: false,
          parent: null,
          loc: [0, 0],
        },
      },
      bundles: {},
    });

    const code = workerPlaceholderCode('./index_worker_abcd.js');
    const rewritten = rewriteWorkerQrlChunkPlaceholders(code, resolver);

    assert.equal(rewritten, 'const chunk = "build/q-worker.js";');
  });

  test('rewrites worker chunk placeholders to final bundle files with paths relative to build', () => {
    const resolver = createBuildWorkerQrlChunkResolver(
      {
        manifestHash: 'hash',
        version: '1',
        mapping: {
          workerSymbol: '../assets/build/q-worker.js',
        },
        symbols: {
          workerSymbol: {
            canonicalFilename: 'index_worker_abcd',
            origin: 'src/routes/index.tsx',
            displayName: 'workerSymbol',
            hash: 'workerSymbol',
            ctxKind: 'function',
            ctxName: 'worker$',
            captures: false,
            parent: null,
            loc: [0, 0],
          },
        },
        bundles: {},
      },
      '/app/'
    );

    const code = workerPlaceholderCode('./index_worker_abcd.js');
    const rewritten = rewriteWorkerQrlChunkPlaceholders(code, resolver);

    assert.equal(rewritten, 'const chunk = "/app/assets/build/q-worker.js";');
  });
});

describe('writeBundle entry facade', () => {
  test('writes the .js facade into the bundle output dir, not the plugin outDir', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'qwik-vite-facade-'));
    try {
      const serverOutDir = path.join(tmp, 'server');
      const ssgOutDir = path.join(tmp, 'ssg-cache');
      await fs.promises.mkdir(serverOutDir, { recursive: true });
      await fs.promises.mkdir(ssgOutDir, { recursive: true });
      // The real deployed entry emitted earlier by the ssr environment build.
      const deployedEntry = path.join(serverOutDir, 'entry.cloudflare-pages.js');
      const deployedCode = 'export const fetch = () => {};';
      await fs.promises.writeFile(deployedEntry, deployedCode);

      const plugins = qwikVite({ optimizerOptions: mockOptimizerOptions() }) as any[];
      const [prePlugin, postPlugin] = plugins;
      await prePlugin.config.call(
        configHookPluginContext,
        {
          build: { ssr: resolve(cwd, 'src', 'entry.cloudflare-pages.tsx'), outDir: serverOutDir },
        },
        { command: 'build', mode: '' }
      );

      // Simulate the ssg environment writing its own bundle to a throwaway dir.
      await postPlugin.writeBundle.call(
        { environment: { config: { consumer: 'server' } } },
        { dir: ssgOutDir },
        { 'entry.cloudflare-pages.mjs': { type: 'chunk' } }
      );

      assert.equal(
        await fs.promises.readFile(deployedEntry, 'utf-8'),
        deployedCode,
        'deployed server entry must not be clobbered by another environment'
      );
      assert.equal(
        await fs.promises.readFile(path.join(ssgOutDir, 'entry.cloudflare-pages.js'), 'utf-8'),
        'export * from "./entry.cloudflare-pages.mjs";'
      );
    } finally {
      await fs.promises.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('worker core chunk rewrites', () => {
  const workerCorePlaceholderCode = () =>
    `import { setPlatform, _deserialize } from "${QWIK_WORKER_CORE_SENTINEL}";`;

  test('rewrites worker core placeholders to relative build chunks from browser workers', () => {
    const resolver = createBuildWorkerCoreChunkResolver('build/qwik-worker-core-abcd.js');
    const code = workerCorePlaceholderCode();
    const rewritten = rewriteWorkerCorePlaceholders(code, () => resolver('assets/worker-1234.js'));

    assert.equal(
      rewritten,
      'import { setPlatform, _deserialize } from "../build/qwik-worker-core-abcd.js";'
    );
  });

  test('rewrites worker core placeholders to relative build chunks from node workers', () => {
    const resolver = createBuildWorkerCoreChunkResolver('build/qwik-worker-core-abcd.js');
    const code = workerCorePlaceholderCode();
    const rewritten = rewriteWorkerCorePlaceholders(code, () =>
      resolver('assets/worker.node-1234.js')
    );

    assert.equal(
      rewritten,
      'import { setPlatform, _deserialize } from "../build/qwik-worker-core-abcd.js";'
    );
  });

  test('rewrites worker core placeholders with same-directory relative imports', () => {
    const resolver = createBuildWorkerCoreChunkResolver('build/qwik-worker-core-abcd.js');
    const code = workerCorePlaceholderCode();
    const rewritten = rewriteWorkerCorePlaceholders(code, () => resolver('build/worker-1234.js'));

    assert.equal(
      rewritten,
      'import { setPlatform, _deserialize } from "./qwik-worker-core-abcd.js";'
    );
  });
});

describe('hotUpdate', () => {
  // A real optimizer so transforms populate the plugin's segment outputs, which the reload
  // decision now consults to tell in-place re-renders from edits Vite must reload.
  const realOptimizerOptions = (): OptimizerOptions => ({
    sys: {
      cwd: () => process.cwd(),
      env: 'node',
      os: process.platform,
      dynamicImport: async (p) => import(p),
      strictDynamicImport: async (p) => import(p),
      path: path as any,
    },
  });

  const transformCtx = { addWatchFile: () => undefined, emitFile: () => undefined } as any;

  function mockServer() {
    const sent: any[] = [];
    return {
      sent,
      server: {
        middlewares: { use() {} },
        hot: {},
        moduleGraph: { getModuleById: () => undefined, invalidateModule: () => undefined },
        environments: {
          client: {
            hot: { send: (msg: any) => sent.push(msg) },
            moduleGraph: { getModuleById: () => undefined, invalidateModule: () => undefined },
          },
        },
      } as any,
    };
  }

  async function setup() {
    const plugins = qwikVite({
      optimizerOptions: realOptimizerOptions(),
      devTools: { imageDevTools: false },
    }) as any;
    const pre = plugins[0] as QwikVitePlugin;
    const post = plugins[1] as QwikVitePlugin;
    await pre.config.call(configHookPluginContext, {}, { command: 'serve', mode: 'development' });
    return { pre, post };
  }

  const invoke = (plugin: QwikVitePlugin, envName: 'ssr' | 'client', modules: any[]) =>
    (plugin.hotUpdate as any).call(
      {
        environment: {
          name: envName,
          moduleGraph: { getModuleById: () => undefined, invalidateModule: () => undefined },
        },
      },
      {
        file: modules[0]?.id ?? modules[0]?.url ?? '',
        modules,
        timestamp: 123,
        read: () => 'export const noop = 0;\n',
      }
    );

  const componentCode = `import { component$ } from '@qwik.dev/core';
export default component$(() => <button onClick$={() => 'x'}>hi</button>);
`;

  const sourceModule = (id: string) => ({
    url: '/src/routes/a/index.tsx',
    type: 'js',
    importers: new Set(),
    id,
  });

  test('source edit re-renders in place and suppresses the client reload', async () => {
    const { pre, post } = await setup();
    const { server, sent } = mockServer();
    post.configureServer!.call(configHookPluginContext, server, undefined as any);

    const id = normalizePath(resolve(cwd, 'src/routes/a/index.tsx'));
    await (pre.transform as any).call(transformCtx, componentCode, id);

    await invoke(post, 'ssr', [sourceModule(id)]);
    const clientReturn = await invoke(post, 'client', [sourceModule(id)]);

    assert.deepEqual(sent, [
      {
        type: 'custom',
        event: 'qwik:hmr',
        data: { files: ['/src/routes/a/index.tsx'], t: 123 },
      },
    ]);
    assert.deepEqual(clientReturn, []);
  });

  const routerConfigModule = () => ({
    url: '@qwik-router-config',
    type: 'js',
    importers: new Set([{ url: '/@fs/qwik-router/lib/request-handler/index.mjs', type: 'js' }]),
    id: '@qwik-router-config',
  });

  test('route edit re-renders even with the appended router config module', async () => {
    const { pre, post } = await setup();
    const { server, sent } = mockServer();
    post.configureServer!.call(configHookPluginContext, server, undefined as any);

    const id = normalizePath(resolve(cwd, 'src/routes/a/index.tsx'));
    await (pre.transform as any).call(transformCtx, componentCode, id);

    await invoke(post, 'ssr', [sourceModule(id), routerConfigModule()]);
    const clientReturn = await invoke(post, 'client', [sourceModule(id)]);

    assert.deepEqual(sent, [
      {
        type: 'custom',
        event: 'qwik:hmr',
        data: { files: ['/src/routes/a/index.tsx'], t: 123 },
      },
    ]);
    assert.deepEqual(clientReturn, []);
  });

  test('worker module edit reloads instead of being swallowed', async () => {
    const { pre, post } = await setup();
    const { server, sent } = mockServer();
    post.configureServer!.call(configHookPluginContext, server, undefined as any);

    const id = normalizePath(resolve(cwd, 'src/thing.worker.ts'));
    await (pre.transform as any).call(
      transformCtx,
      `self.onmessage = () => postMessage('w');\n`,
      id
    );

    const workerModule = {
      url: '/src/thing.worker.ts?worker_file&type=module',
      id,
      type: 'js',
      importers: new Set(),
    };
    // A client-only worker is absent from the SSR module graph.
    await invoke(post, 'ssr', []);
    const clientReturn = await invoke(post, 'client', [workerModule]);

    // A re-render can't recreate the worker, so we reload rather than let Vite swallow the edit.
    assert.deepEqual(sent, [{ type: 'full-reload' }]);
    assert.deepEqual(clientReturn, []);
  });

  test('plain util edit stays in place instead of reloading', async () => {
    const { pre, post } = await setup();
    const { server, sent } = mockServer();
    post.configureServer!.call(configHookPluginContext, server, undefined as any);

    const id = normalizePath(resolve(cwd, 'src/util.ts'));
    await (pre.transform as any).call(transformCtx, `export const help = () => 'help';\n`, id);

    const utilModule = { url: '/src/util.ts', id, type: 'js', importers: new Set() };
    const clientReturn = await invoke(post, 'client', [utilModule]);

    // undefined lets Vite propagate through the segment self-accept, which updates in place.
    assert.isUndefined(clientReturn);
    assert.notInclude(
      sent.map((m) => m.type),
      'full-reload'
    );
  });

  const taskHookCode = `import { useTask$ } from '@qwik.dev/core';
export const useThing = () => {
  useTask$(() => {
    console.log('thing');
  });
};
`;

  test('task-bearing shared hook edit re-renders in place instead of reloading', async () => {
    const { pre, post } = await setup();
    const { server, sent } = mockServer();
    post.configureServer!.call(configHookPluginContext, server, undefined as any);

    const id = normalizePath(resolve(cwd, 'src/use-thing.ts'));
    await (pre.transform as any).call(transformCtx, taskHookCode, id);

    const hookModule = {
      url: '/src/use-thing.ts',
      type: 'js',
      importers: new Set(),
      id,
    };
    await invoke(post, 'ssr', [hookModule]);
    const clientReturn = await invoke(post, 'client', [hookModule]);

    assert.deepEqual(sent, [
      {
        type: 'custom',
        event: 'qwik:hmr',
        data: { files: ['/src/use-thing.ts'], t: 123 },
      },
    ]);
    assert.deepEqual(clientReturn, []);
  });

  test('non-source change neither re-renders nor suppresses', async () => {
    const { post } = await setup();
    const { server, sent } = mockServer();
    post.configureServer!.call(configHookPluginContext, server, undefined as any);

    const assetModule = {
      url: '/src/data.json',
      id: '/src/data.json',
      type: 'js',
      importers: new Set(),
    };
    await invoke(post, 'ssr', [assetModule]);
    const clientReturn = await invoke(post, 'client', [assetModule]);

    assert.deepEqual(sent, []);
    assert.isUndefined(clientReturn);
  });

  test('css module edit updates in place when the class map is unchanged, reloads when it changes', async () => {
    const { post } = await setup();
    const config = await resolveConfig(
      {
        configFile: false,
        logLevel: 'silent',
        css: { modules: { generateScopedName: (name: string) => `${name}_stable` } },
      },
      'serve',
      'development'
    );
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'qwik-cssmod-')), 'x.module.css');
    const sent: any[] = [];
    const server = {
      config,
      environments: {
        client: {
          moduleGraph: { getModulesByFile: () => [{ url: '/x.module.css' }] },
          hot: { send: (msg: any) => sent.push(msg) },
        },
      },
    };
    const edit = (css: string) => {
      writeFileSync(file, css);
      return (post.hotUpdate as any).call(
        { environment: { name: 'client' } },
        { file, modules: [{ url: file, type: 'js', importers: new Set() }], timestamp: 7, server }
      );
    };

    await edit('.box { color: red; }');
    assert.deepEqual(sent.at(-1), { type: 'full-reload' });

    await edit('.box { color: blue; }');
    assert.deepEqual(sent.at(-1), {
      type: 'custom',
      event: 'qwik:css-module-update',
      data: { url: '/x.module.css', t: 7 },
    });

    await edit('.box { color: blue; } .row { display: flex; }');
    assert.deepEqual(sent.at(-1), { type: 'full-reload' });
  });
});

describe('css module class map', () => {
  test('isSameClassMap is true only when every local maps to the same scoped name', () => {
    assert.isTrue(isSameClassMap({ box: '_box_1' }, { box: '_box_1' }));
    assert.isFalse(isSameClassMap({ box: '_box_1' }, { box: '_box_2' }));
    assert.isFalse(isSameClassMap({ box: '_box_1' }, { box: '_box_1', row: '_row_1' }));
  });
});
