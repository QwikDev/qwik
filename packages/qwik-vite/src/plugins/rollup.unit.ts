import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path, { resolve } from 'node:path';
import { qwikRollup } from './rollup';
import type { Rollup } from 'vite';
import type { OptimizerOptions } from '../types';
import type { NormalizedQwikPluginOptions } from './plugin';
import { assert, test } from 'vitest';
import { normalizePath } from '../../../qwik/src/testing/util';

const cwd = process.cwd();

function mockOptimizerOptions(rootDir = process.cwd()): OptimizerOptions {
  return {
    sys: {
      cwd: () => rootDir,
      env: 'node',
      os: process.platform,
      dynamicImport: async (path) => import(path),
      strictDynamicImport: async (path) => import(path),
      path: path as any,
    },
    binding: { mockBinding: true },
  };
}

test('rollup default input options, client', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikRollup(initOpts);
  const rollupInputOpts: Rollup.InputOptions = await plugin.options!({});

  assert.deepEqual(typeof rollupInputOpts.onwarn, 'function');
  assert.deepEqual((rollupInputOpts.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'root')),
  ]);
});

test('rollup default input options, ssr', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
  } as any;
  const plugin = qwikRollup(initOpts);
  const rollupInputOpts: Rollup.InputOptions = await plugin.options!({});
  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();

  assert.deepEqual(typeof rollupInputOpts.onwarn, 'function');
  assert.deepEqual(rollupInputOpts.treeshake, undefined);
  assert.deepEqual((rollupInputOpts.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'entry.ssr')),
  ]);
  assert.deepEqual((opts.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'entry.ssr')),
  ]);
});

test('rollup default set input options, ssr', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
  } as any;
  const plugin = qwikRollup(initOpts);
  const input = normalizePath(resolve(cwd, 'src', 'my.ssr.tsx'));
  const rollupInputOpts: Rollup.InputOptions = await plugin.options!({
    input,
  });
  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(typeof rollupInputOpts.onwarn, 'function');
  assert.deepEqual(rollupInputOpts.treeshake, undefined);
  assert.deepEqual(rollupInputOpts.input, [input]);
  assert.deepEqual(opts.input, [input]);
});

test('rollup default output options, client', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});
  const rollupOutputOpts: Rollup.OutputOptions = await plugin.outputOptions!({});

  assert.deepEqual(rollupOutputOpts.dir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(rollupOutputOpts.format, 'es');
});

test('uses explicit Rolldown code splitting with Vite 8', async () => {
  const rootDir = await mkdtemp(resolve(tmpdir(), 'qwik-vite-'));
  try {
    const viteDir = resolve(rootDir, 'node_modules', 'vite');
    await mkdir(viteDir, { recursive: true });
    await writeFile(resolve(viteDir, 'package.json'), JSON.stringify({ version: '8.0.0' }));

    const plugin = qwikRollup({ optimizerOptions: mockOptimizerOptions(rootDir) });
    await plugin.options!({});
    const output = (await plugin.outputOptions!({
      manualChunks: () => 'manual',
    })) as Rollup.OutputOptions & {
      onlyExplicitManualChunks?: boolean;
      codeSplitting: {
        includeDependenciesRecursively: boolean;
        groups: Array<{ name: (id: string, context: object) => string | void | null }>;
      };
    };

    assert.isUndefined(output.manualChunks);
    assert.isUndefined(output.onlyExplicitManualChunks);
    assert.isFalse(output.codeSplitting.includeDependenciesRecursively);
    assert.equal(
      output.codeSplitting.groups[0].name('module', { getModuleInfo: () => null }),
      'manual'
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('rollup default output options, ssr', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});
  const rollupOutputOpts: Rollup.OutputOptions = await plugin.outputOptions!({
    format: 'cjs',
  });

  assert.deepEqual(rollupOutputOpts.dir, normalizePath(resolve(cwd, 'server')));
  assert.deepEqual(rollupOutputOpts.exports, 'auto');
});

test('rollup input, default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'segment' });
  assert.deepEqual(opts.rootDir, normalizePath(cwd));
  assert.deepEqual(opts.srcDir, normalizePath(resolve(cwd, 'src')));
});

test('rollup input, client default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'client',
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'segment' });
});

test('rollup input, client/production default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'client',
    buildMode: 'production',
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'smart' });
});

test('rollup input, ssr/development default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
    buildMode: 'development',
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
});

test('rollup input, ssr/production default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
    buildMode: 'production',
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
});

test('rollup input, lib/production default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'lib',
    buildMode: 'production',
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'lib');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'inline' });
});

test('rollup input, forceFullBuild true', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
    buildMode: 'development',
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
});
