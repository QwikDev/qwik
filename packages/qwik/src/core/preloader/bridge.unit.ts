import { afterEach, expect, test, vi } from 'vitest';
import { requestPreload, setPreloader } from './bridge';

afterEach(() => {
  setPreloader(undefined);
  delete (globalThis as any).qPreloadStart;
  delete (globalThis as any).qPreloadQueue;
});

test('starts the preloader for highest priority hints but not speculative ones', () => {
  const start = vi.fn();
  (globalThis as any).qPreloadStart = start;

  requestPreload('speculative.js', 0.8);
  expect(start).not.toHaveBeenCalled();

  requestPreload('visible-task.js', 1);
  expect(start).toHaveBeenCalledOnce();

  const preload = vi.fn();
  setPreloader(preload);
  expect(preload.mock.calls).toEqual([
    ['speculative.js', 0.8],
    ['visible-task.js', 1],
  ]);
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

test('delivers requests buffered by another copy of the bridge', async () => {
  // Core and the preloader chunk each bundle their own copy of this module
  vi.resetModules();
  const core = await import('./bridge');
  vi.resetModules();
  const preloaderChunk = await import('./bridge');
  expect(preloaderChunk).not.toBe(core);

  core.requestPreload('handler.js', 1);

  const preload = vi.fn();
  preloaderChunk.setPreloader(preload);

  expect(preload).toHaveBeenCalledWith('handler.js', 1);
  preloaderChunk.setPreloader(undefined);
});
