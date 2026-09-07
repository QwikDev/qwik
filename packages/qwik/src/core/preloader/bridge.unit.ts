import { afterEach, expect, test, vi } from 'vitest';
import { requestPreload, setPreloader } from './bridge';

afterEach(() => {
  setPreloader(undefined);
});

test('ignores preload requests before the preloader is installed', () => {
  expect(() => requestPreload('entry.js', 0.8)).not.toThrow();
});

test('forwards preload requests after the preloader is installed', () => {
  const preload = vi.fn();
  setPreloader(preload);

  requestPreload('entry.js', 0.8);

  expect(preload).toHaveBeenCalledWith('entry.js', 0.8);
});
