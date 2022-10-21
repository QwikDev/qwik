import path, { resolve } from 'node:path';
import { qwikRollup } from './rollup';
import type { InputOptions, OutputOptions } from 'rollup';
import type { OptimizerOptions } from '../types';
import type { NormalizedQwikPluginOptions } from './plugin';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { normalizePath } from '../../../testing/util';

const rollup = suite('rollup');
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

rollup('rollup default input options, client', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikRollup(initOpts);
  const rollupInputOpts: InputOptions = await plugin.options!({});

  equal(typeof rollupInputOpts.onwarn, 'function');
  equal(rollupInputOpts.input, [normalizePath(resolve(cwd, 'src', 'root.tsx'))]);
});

rollup('rollup default input options, ssr', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
  } as any;
  const plugin = qwikRollup(initOpts);
  const rollupInputOpts: InputOptions = await plugin.options!({});
  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();

  equal(typeof rollupInputOpts.onwarn, 'function');
  equal(rollupInputOpts.treeshake, false);
  equal(rollupInputOpts.input, [normalizePath(resolve(cwd, 'src', 'entry.ssr.tsx'))]);
  equal(opts.input, [normalizePath(resolve(cwd, 'src', 'entry.ssr.tsx'))]);
});

rollup('rollup default set input options, ssr', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
  } as any;
  const plugin = qwikRollup(initOpts);
  const rollupInputOpts: InputOptions = await plugin.options!({
    input: normalizePath(resolve(cwd, 'src', 'my.ssr.tsx')),
  });
  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();

  equal(typeof rollupInputOpts.onwarn, 'function');
  equal(rollupInputOpts.treeshake, false);
  equal(rollupInputOpts.input, normalizePath(resolve(cwd, 'src', 'my.ssr.tsx')));
  equal(opts.input, [normalizePath(resolve(cwd, 'src', 'my.ssr.tsx'))]);
});

rollup('rollup default output options, client', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});
  const rollupOutputOpts: OutputOptions = await plugin.outputOptions!({});

  equal(rollupOutputOpts.dir, normalizePath(resolve(cwd, 'dist')));
  equal(rollupOutputOpts.format, 'es');
});

rollup('rollup default output options, ssr', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});
  const rollupOutputOpts: OutputOptions = await plugin.outputOptions!({
    format: 'cjs',
  });

  equal(rollupOutputOpts.dir, normalizePath(resolve(cwd, 'server')));
  equal(rollupOutputOpts.exports, 'auto');
});

rollup('rollup input, default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  equal(opts.target, 'client');
  equal(opts.buildMode, 'development');
  equal(opts.entryStrategy, { type: 'hook' });
  equal(opts.forceFullBuild, true);
  equal(opts.rootDir, normalizePath(cwd));
  equal(opts.srcDir, normalizePath(resolve(cwd, 'src')));
});

rollup('rollup input, client default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'client',
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  equal(opts.target, 'client');
  equal(opts.buildMode, 'development');
  equal(opts.entryStrategy, { type: 'hook' });
  equal(opts.forceFullBuild, true);
});

rollup('rollup input, client/production default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'client',
    buildMode: 'production',
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  equal(opts.target, 'client');
  equal(opts.buildMode, 'production');
  equal(opts.entryStrategy, { type: 'smart' });
  equal(opts.forceFullBuild, true);
});

rollup('rollup input, ssr/development default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
    buildMode: 'development',
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  equal(opts.target, 'ssr');
  equal(opts.buildMode, 'development');
  equal(opts.entryStrategy, { type: 'inline' });
  equal(opts.forceFullBuild, true);
});

rollup('rollup input, ssr/production default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
    buildMode: 'production',
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  equal(opts.target, 'ssr');
  equal(opts.buildMode, 'production');
  equal(opts.entryStrategy, { type: 'inline' });
  equal(opts.forceFullBuild, true);
});

rollup('rollup input, lib/production default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'lib',
    buildMode: 'production',
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  equal(opts.target, 'lib');
  equal(opts.buildMode, 'development');
  equal(opts.entryStrategy, { type: 'inline' });
  equal(opts.forceFullBuild, true);
});

rollup('rollup input, forceFullBuild true', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
    forceFullBuild: true,
    buildMode: 'development',
  } as any;
  const plugin = qwikRollup(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  equal(opts.target, 'ssr');
  equal(opts.buildMode, 'development');
  equal(opts.entryStrategy, { type: 'inline' });
  equal(opts.forceFullBuild, true);
});

rollup.run();
