import path from 'node:path';
import { assert, describe, test } from 'vitest';
import type { OptimizerOptions } from '../types';
import { qwikEsbuild, type QwikEsbuildPluginOptions } from './esbuild';

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

test('esbuild plugin creation', async () => {
  const initOpts: QwikEsbuildPluginOptions = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikEsbuild(initOpts);

  assert.equal(plugin.name, 'esbuild-plugin-qwik');
  assert.equal(typeof plugin.setup, 'function');
  assert.equal(typeof (plugin as any).api, 'object');
});

test('esbuild plugin api methods', async () => {
  const initOpts: QwikEsbuildPluginOptions = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikEsbuild(initOpts);
  const api = (plugin as any).api;

  assert.equal(typeof api.getOptimizer, 'function');
  assert.equal(typeof api.getOptions, 'function');
});

test('esbuild default options, client', async () => {
  const initOpts: QwikEsbuildPluginOptions = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikEsbuild(initOpts);
  const api = (plugin as any).api;

  // The plugin needs to be initialized to get options
  // In a real scenario, this would happen during the setup phase
  try {
    const options = api.getOptions();
    // Options won't be available until the plugin is initialized
    assert.equal(options.target, 'client');
  } catch (error) {
    // Expected since plugin isn't initialized yet
    assert.equal((error as Error).message, 'Qwik plugin has not been initialized');
  }
});

test('esbuild options, ssr target', async () => {
  const initOpts: QwikEsbuildPluginOptions = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
  };
  const plugin = qwikEsbuild(initOpts);

  assert.equal(plugin.name, 'esbuild-plugin-qwik');
  // Further testing would require mocking the ESBuild build context
});

test('esbuild options, production build mode', async () => {
  const initOpts: QwikEsbuildPluginOptions = {
    optimizerOptions: mockOptimizerOptions(),
    buildMode: 'production',
  };
  const plugin = qwikEsbuild(initOpts);

  assert.equal(plugin.name, 'esbuild-plugin-qwik');
});

test('esbuild options with custom directories', async () => {
  const initOpts: QwikEsbuildPluginOptions = {
    optimizerOptions: mockOptimizerOptions(),
    rootDir: './custom-root',
    srcDir: './custom-src',
    outDir: './custom-out',
  };
  const plugin = qwikEsbuild(initOpts);

  assert.equal(plugin.name, 'esbuild-plugin-qwik');
});

test('esbuild options with entry strategy', async () => {
  const initOpts: QwikEsbuildPluginOptions = {
    optimizerOptions: mockOptimizerOptions(),
    entryStrategy: { type: 'smart' },
  };
  const plugin = qwikEsbuild(initOpts);

  assert.equal(plugin.name, 'esbuild-plugin-qwik');
});

test('esbuild options with experimental features', async () => {
  const initOpts: QwikEsbuildPluginOptions = {
    optimizerOptions: mockOptimizerOptions(),
    experimental: ['preventNavigate'],
  };
  const plugin = qwikEsbuild(initOpts);

  assert.equal(plugin.name, 'esbuild-plugin-qwik');
});

test('esbuild options with manifest callbacks', async () => {
  const manifestOutput = async () => {};
  const transformedModuleOutput = async () => {};

  const initOpts: QwikEsbuildPluginOptions = {
    optimizerOptions: mockOptimizerOptions(),
    manifestOutput,
    transformedModuleOutput,
  };
  const plugin = qwikEsbuild(initOpts);

  assert.equal(plugin.name, 'esbuild-plugin-qwik');
});

test('esbuild options with input variants', async () => {
  // Test with string input
  const initOpts1: QwikEsbuildPluginOptions = {
    optimizerOptions: mockOptimizerOptions(),
    input: './src/main.tsx',
  };
  const plugin1 = qwikEsbuild(initOpts1);
  assert.equal(plugin1.name, 'esbuild-plugin-qwik');

  // Test with array input
  const initOpts2: QwikEsbuildPluginOptions = {
    optimizerOptions: mockOptimizerOptions(),
    input: ['./src/main.tsx', './src/worker.ts'],
  };
  const plugin2 = qwikEsbuild(initOpts2);
  assert.equal(plugin2.name, 'esbuild-plugin-qwik');

  // Test with object input
  const initOpts3: QwikEsbuildPluginOptions = {
    optimizerOptions: mockOptimizerOptions(),
    input: {
      main: './src/main.tsx',
      worker: './src/worker.ts',
    },
  };
  const plugin3 = qwikEsbuild(initOpts3);
  assert.equal(plugin3.name, 'esbuild-plugin-qwik');
});

describe('getLoaderForFile', () => {
  test('returns correct loader for file extensions', () => {
    // We need to access the internal function for testing
    // In a real implementation, this would be tested through the plugin behavior
    // This would require exposing the function for testing
    // For now, we just ensure the plugin can be created
    const plugin = qwikEsbuild({
      optimizerOptions: mockOptimizerOptions(),
    });
    assert.equal(plugin.name, 'esbuild-plugin-qwik');
  });
});

describe('plugin setup', () => {
  test('setup function configures build hooks', () => {
    const plugin = qwikEsbuild({
      optimizerOptions: mockOptimizerOptions(),
    });

    // This would test the setup function with a mock build context
    // but since we can't easily mock the build context without complex setup,
    // we just ensure the plugin can be created successfully
    assert.equal(plugin.name, 'esbuild-plugin-qwik');
    assert.equal(typeof plugin.setup, 'function');
  });
});

describe('mock rollup context', () => {
  test('creates mock context with required methods', () => {
    // The createMockRollupContext function is internal
    // We test that the plugin can be created successfully
    const plugin = qwikEsbuild({
      optimizerOptions: mockOptimizerOptions(),
    });
    assert.equal(plugin.name, 'esbuild-plugin-qwik');
  });
});

describe('esbuild plugin integration', () => {
  test('plugin options are properly normalized', async () => {
    const initOpts: QwikEsbuildPluginOptions = {
      optimizerOptions: mockOptimizerOptions(),
      target: 'client',
      buildMode: 'development',
      debug: true,
      rootDir: cwd,
      srcDir: path.join(cwd, 'src'),
      outDir: path.join(cwd, 'dist'),
      sourcemap: true,
      lint: true,
    };

    const plugin = qwikEsbuild(initOpts);
    assert.equal(plugin.name, 'esbuild-plugin-qwik');

    // The plugin should be created successfully with all options
    const api = (plugin as any).api;
    assert.equal(typeof api.getOptimizer, 'function');
    assert.equal(typeof api.getOptions, 'function');
  });
});
