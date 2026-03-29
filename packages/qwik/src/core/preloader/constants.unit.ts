import { afterEach, describe, expect, it, vi } from 'vitest';

const restoreGlobals = () => {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  delete (globalThis as any).HTMLElement;
  delete (globalThis as any).WorkerGlobalScope;
  delete (globalThis as any).self;
};

const importConstants = async () => {
  vi.resetModules();
  return import('./constants');
};

describe('preloader constants', () => {
  afterEach(() => {
    restoreGlobals();
  });

  it('does not assume document exists in browser workers', async () => {
    class FakeWorkerGlobalScope {}

    (globalThis as any).WorkerGlobalScope = FakeWorkerGlobalScope;
    (globalThis as any).self = Object.create(FakeWorkerGlobalScope.prototype);

    const { doc, hasDocument, rel } = await importConstants();

    expect(hasDocument).toBe(false);
    expect(doc).toBeUndefined();
    expect(rel).toBe('preload');
  });
});
