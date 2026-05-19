import { createPlatform, getPlatform, setPlatform } from '../core/shared/platform/platform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBrowserWorkerPlatform,
  setBrowserWorkerPlatform,
  runWorkerMessage,
  // @ts-expect-error - testing internal API
} from './worker.shared.js';
import { _regSymbol, _serialize, inlinedQrl } from '@qwik.dev/core';

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

  it('invokes worker QRLs with the provided this context', async () => {
    const symbolName = 'workerThisBindingTest';
    const invokeThis = { prefix: 'Hello ' };
    const qrl = inlinedQrl<(...args: unknown[]) => unknown>(null, symbolName);
    const serializedArgs = await _serialize([qrl, 'World']);

    setBrowserWorkerPlatform(new URL('./worker.js', import.meta.url).href);
    _regSymbol(function (this: { prefix: string }, value: string) {
      return this.prefix + value;
    }, symbolName);

    const postMessage = vi.fn();
    await runWorkerMessage([7, serializedArgs], postMessage, invokeThis);

    expect(postMessage).toHaveBeenCalledWith([7, true, 'Hello World']);
  });
});
