import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createQwikPlugin } from './plugin';

const optimizers = vi.hoisted(() => ({
  rust: vi.fn(),
  typescript: vi.fn(),
}));

const optimizer = {
  sys: { env: 'browsermain', os: process.platform, path },
};

vi.mock('../../../optimizer/src/index', () => ({ createOptimizer: optimizers.rust }));
vi.mock('@qwik.dev/ts-optimizer', () => ({ createOptimizer: optimizers.typescript }));

beforeEach(() => {
  optimizers.rust.mockReset().mockResolvedValue(optimizer);
  optimizers.typescript.mockReset().mockResolvedValue(optimizer);
});

afterEach(() => {
  delete process.env.QWIK_OPTIMIZER;
});

test('uses the Rust optimizer by default', async () => {
  await createQwikPlugin().init();

  expect(optimizers.rust).toHaveBeenCalledOnce();
  expect(optimizers.typescript).not.toHaveBeenCalled();
});

test('uses the TypeScript optimizer when requested', async () => {
  await createQwikPlugin({ tsOptimizer: true }).init();

  expect(optimizers.typescript).toHaveBeenCalledOnce();
  expect(optimizers.rust).not.toHaveBeenCalled();
});

test('QWIK_OPTIMIZER=rust overrides a config that asks for the TypeScript optimizer', async () => {
  process.env.QWIK_OPTIMIZER = 'rust';
  await createQwikPlugin({ tsOptimizer: true }).init();

  expect(optimizers.rust).toHaveBeenCalledOnce();
  expect(optimizers.typescript).not.toHaveBeenCalled();
});

test('QWIK_OPTIMIZER=ts overrides the default', async () => {
  process.env.QWIK_OPTIMIZER = 'ts';
  await createQwikPlugin().init();

  expect(optimizers.typescript).toHaveBeenCalledOnce();
  expect(optimizers.rust).not.toHaveBeenCalled();
});

test('an unknown QWIK_OPTIMIZER value fails instead of picking an optimizer', async () => {
  process.env.QWIK_OPTIMIZER = 'typescript';
  await expect(createQwikPlugin().init()).rejects.toThrow(/QWIK_OPTIMIZER/);
});
