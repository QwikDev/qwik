import { join } from 'path';
import { qwikRollup, QwikRollupPluginOptions } from './rollup';
import type { InputOptions, OutputOptions } from 'rollup';
import type { OptimizerOptions } from '../types';

describe('rollup  plugin', () => {
  const cwd = process.cwd();
  let initOpts: QwikRollupPluginOptions = {};

  beforeEach(() => {
    initOpts = {
      optimizerOptions: mockOptimizerOptions(),
    };
  });

  it('rollup default input options, client', async () => {
    const plugin = qwikRollup(initOpts);
    const rollupInputOpts: InputOptions = await plugin.options!({});

    expect(typeof rollupInputOpts.onwarn).toBe('function');
    expect(rollupInputOpts.input).toEqual([join(cwd, 'src', 'root.tsx')]);
  });

  it('rollup default input options, ssr', async () => {
    initOpts.buildMode = 'ssr';
    const plugin = qwikRollup(initOpts);
    const rollupInputOpts: InputOptions = await plugin.options!({});

    expect(typeof rollupInputOpts.onwarn).toBe('function');
    expect(rollupInputOpts.treeshake).toBe(false);
    expect(rollupInputOpts.input).toEqual(join(cwd, 'src', 'entry.server.tsx'));
  });

  it('rollup default output options, client', async () => {
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});
    const rollupOutputOpts: OutputOptions = await plugin.outputOptions!({});

    expect(rollupOutputOpts.dir).toEqual(join(cwd, 'dist'));
    expect(rollupOutputOpts.format).toEqual('es');
  });

  it('rollup default output options, ssr', async () => {
    initOpts.buildMode = 'ssr';
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});
    const rollupOutputOpts: OutputOptions = await plugin.outputOptions!({});

    expect(rollupOutputOpts.dir).toEqual(join(cwd, 'server'));
    expect(rollupOutputOpts.format).toEqual('cjs');
    expect(rollupOutputOpts.exports).toEqual('auto');
  });

  function mockOptimizerOptions(): OptimizerOptions {
    return {
      sys: {
        cwd: () => process.cwd(),
        env: () => 'node',
        dynamicImport: async (path) => require(path),
        path: require('path'),
      },
      binding: { mockBinding: true },
    };
  }
});
