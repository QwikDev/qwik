import { createPlatform, getPlatform, setPlatform } from '../core/shared/platform/platform';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error - testing internal API
import { createBrowserWorkerPlatform, setBrowserWorkerPlatform } from './worker.shared.js';

describe('worker.shared', () => {
  const originalPlatform = getPlatform();

  afterEach(() => {
    setPlatform(originalPlatform ?? createPlatform());
  });

  it('resolves browser worker imports relative to the worker base url without a container', async () => {
    const platform = createBrowserWorkerPlatform(new URL('./worker.js', import.meta.url).href);

    const imported = await platform.importSymbol(
      null,
      './worker-platform.test.mjs',
      'workerPlatformProbe'
    );

    expect(imported()).toBe('browser-worker-platform');
  });

  it('installs the browser worker platform as a server-style platform', () => {
    setBrowserWorkerPlatform(new URL('./worker.js', import.meta.url).href);

    expect(getPlatform().isServer).toBe(true);
  });
});
