import { afterEach, expect, test, vi } from 'vitest';
import { requestPreload, setPreloader } from './bridge';

afterEach(() => {
  setPreloader(undefined);
});

test('buffers preload requests until the preloader is installed', () => {
  requestPreload('entry.js', 0.8);
  requestPreload(['a.js', 'b.js'], 1);

  const preload = vi.fn();
  setPreloader(preload);

  expect(preload.mock.calls).toEqual([
    ['entry.js', 0.8],
    [['a.js', 'b.js'], 1],
  ]);
});

test('forwards preload requests after the preloader is installed', () => {
  const preload = vi.fn();
  setPreloader(preload);

  requestPreload('entry.js', 0.8);

  expect(preload).toHaveBeenCalledWith('entry.js', 0.8);
});
