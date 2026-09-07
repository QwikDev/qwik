import path from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';
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
