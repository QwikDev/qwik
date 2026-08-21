import path, { resolve } from 'node:path';
import { qwikRolldown } from './rolldown';
import type { Rolldown } from 'vite';
import type { OptimizerOptions } from '../types';
import type { NormalizedQwikPluginOptions } from './plugin';
import { assert, expect, test, vi } from 'vitest';
import { normalizePath } from '../../../qwik/src/testing/util';

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

test('rolldown default input options, client', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikRolldown(initOpts);
  const rolldownInputOpts: Rolldown.InputOptions = await plugin.options!({});

  assert.deepEqual((rolldownInputOpts.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'root')),
  ]);
});

test('rolldown default input options, ssr', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
  } as any;
  const plugin = qwikRolldown(initOpts);
  const rolldownInputOpts: Rolldown.InputOptions = await plugin.options!({});
  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();

  assert.deepEqual(rolldownInputOpts.treeshake, undefined);
  assert.deepEqual((rolldownInputOpts.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'entry.ssr')),
  ]);
  assert.deepEqual((opts.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'entry.ssr')),
  ]);
});

test('rolldown default set input options, ssr', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
  } as any;
  const plugin = qwikRolldown(initOpts);
  const input = normalizePath(resolve(cwd, 'src', 'my.ssr.tsx'));
  const rolldownInputOpts: Rolldown.InputOptions = await plugin.options!({
    input,
  });
  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(rolldownInputOpts.treeshake, undefined);
  assert.deepEqual(rolldownInputOpts.input, [input]);
  assert.deepEqual(opts.input, [input]);
});

test('rolldown default output options, client', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});
  const rolldownOutputOpts: Rolldown.OutputOptions = await plugin.outputOptions!({});

  assert.deepEqual(rolldownOutputOpts.dir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(rolldownOutputOpts.format, 'es');
});

test('rolldown default output options, ssr', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});
  const rolldownOutputOpts: Rolldown.OutputOptions = await plugin.outputOptions!({
    format: 'cjs',
  });

  assert.deepEqual(rolldownOutputOpts.dir, normalizePath(resolve(cwd, 'server')));
  assert.deepEqual(rolldownOutputOpts.exports, 'auto');
});

test('rolldown input, default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'segment' });
  assert.deepEqual(opts.rootDir, normalizePath(cwd));
  assert.deepEqual(opts.srcDir, normalizePath(resolve(cwd, 'src')));
});

test('rolldown input, client default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'client',
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'segment' });
});

test('rolldown input, client/production default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'client',
    buildMode: 'production',
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'smart' });
});

test('rolldown input, ssr/development default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
    buildMode: 'development',
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
});

test('rolldown input, ssr/production default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
    buildMode: 'production',
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
});

test('rolldown input, lib/production default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'lib',
    buildMode: 'production',
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'lib');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'inline' });
});

test('rolldown input, forceFullBuild true', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
    buildMode: 'development',
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
});

type CodeSplitting = Exclude<Rolldown.OutputOptions['codeSplitting'], boolean | undefined>;

async function clientCodeSplitting(output: Rolldown.OutputOptions) {
  const plugin = qwikRolldown({ optimizerOptions: mockOptimizerOptions() });
  await plugin.options!({});
  const outputOpts: Rolldown.OutputOptions = await plugin.outputOptions!(output);
  return outputOpts.codeSplitting as CodeSplitting;
}

test('codeSplitting starts with the qwik groups and disables dependency recursion', async () => {
  const codeSplitting = await clientCodeSplitting({});

  assert.deepEqual(codeSplitting.includeDependenciesRecursively, false);
  assert.deepEqual(
    codeSplitting.groups!.map((group) => group.name),
    ['qwik-core', 'qwik-preloader', codeSplitting.groups![2].name]
  );
  assert.deepEqual(typeof codeSplitting.groups![2].name, 'function');
  assert.deepEqual(
    codeSplitting.groups!.map((group) => group.includeDependenciesRecursively),
    [false, false, false]
  );
});

test('codeSplitting appends the user groups after the qwik groups', async () => {
  const vendor = { name: 'vendor', test: /node_modules/ };
  const codeSplitting = await clientCodeSplitting({ codeSplitting: { groups: [vendor] } });

  assert.deepEqual(codeSplitting.groups!.length, 4);
  assert.deepEqual(codeSplitting.groups![3], vendor);
});

test('codeSplitting keeps the user top-level options without touching the qwik groups', async () => {
  const codeSplitting = await clientCodeSplitting({
    codeSplitting: { includeDependenciesRecursively: true, minSize: 20000 },
  });

  assert.deepEqual(codeSplitting.includeDependenciesRecursively, true);
  assert.deepEqual(codeSplitting.minSize, 20000);
  assert.deepEqual(
    codeSplitting.groups!.map((group) => group.includeDependenciesRecursively),
    [false, false, false]
  );
});

test('codeSplitting true is the default and keeps the qwik groups', async () => {
  const codeSplitting = await clientCodeSplitting({ codeSplitting: true });

  assert.deepEqual(codeSplitting.groups!.length, 3);
});

test('codeSplitting false throws', async () => {
  await expect(clientCodeSplitting({ codeSplitting: false })).rejects.toThrow(/lazy loading/);
});

test('warns that manualChunks and advancedChunks are ignored', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  await clientCodeSplitting({ manualChunks: () => null });
  await clientCodeSplitting({ advancedChunks: { groups: [] } });
  await clientCodeSplitting({});

  assert.deepEqual(warn.mock.calls.length, 2);
  assert.match(warn.mock.calls[0][0], /codeSplitting\.groups/);
  warn.mockRestore();
});
