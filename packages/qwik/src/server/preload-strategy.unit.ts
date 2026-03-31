import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
});

test('expandBundles computes the SSR preload queue synchronously', async () => {
  vi.resetModules();

  const { setPlatform } = await import('../core/shared/platform/platform');
  setPlatform({
    isServer: true,
    importSymbol() {
      throw new Error('not implemented');
    },
    raf(fn: () => void) {
      return Promise.resolve(fn());
    },
    chunkForSymbol() {
      return undefined;
    },
  } as any);

  const { initPreloader } = await import('../core/preloader/bundle-graph');
  const { expandBundles } = await import('./preload-strategy');

  initPreloader(['entry-a.js', -10, 3, 'dep-1.js']);

  expect(
    expandBundles(['entry-a.js'], {
      manifest: { bundleGraph: ['entry-a.js', -10, 3, 'dep-1.js'] },
    } as any)
  ).toEqual([10, 'dep-1.js', 'entry-a.js']);
});
