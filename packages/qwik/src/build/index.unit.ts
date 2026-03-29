import { afterEach, describe, expect, it, vi } from 'vitest';

const restoreGlobals = () => {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  delete (globalThis as any).HTMLElement;
  delete (globalThis as any).WorkerGlobalScope;
  delete (globalThis as any).self;
};

const importBuild = async () => {
  vi.resetModules();
  return import('./index');
};

describe('build environment flags', () => {
  afterEach(() => {
    restoreGlobals();
  });

  it('treats a DOM window as browser', async () => {
    const HTMLElement = function HTMLElement() {};
    Object.defineProperty(HTMLElement, 'toString', {
      value: () => 'function HTMLElement() { [native code] }',
    });

    (globalThis as any).window = { document: {} };
    (globalThis as any).document = (globalThis as any).window.document;
    (globalThis as any).HTMLElement = HTMLElement;

    const { isBrowser, isServer } = await importBuild();

    expect(isBrowser).toBe(true);
    expect(isServer).toBe(false);
  });

  it('treats a browser worker as browser', async () => {
    class FakeWorkerGlobalScope {}

    (globalThis as any).WorkerGlobalScope = FakeWorkerGlobalScope;
    (globalThis as any).self = Object.create(FakeWorkerGlobalScope.prototype);

    const { isBrowser, isServer } = await importBuild();

    expect(isBrowser).toBe(true);
    expect(isServer).toBe(false);
  });

  it('treats runtimes without window or worker globals as non-browser', async () => {
    const { isBrowser, isServer } = await importBuild();

    expect(isBrowser).toBe(false);
    expect(isServer).toBe(true);
  });
});
