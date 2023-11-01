import { beforeAll } from 'vitest';

// This has to run before qdev.ts loads. `beforeAll` is too late
globalThis.qTest = true;
globalThis.qRuntimeQrl = true;
globalThis.qDev = true;
globalThis.qInspector = false;

beforeAll(async () => {
  const { getTestPlatform } = await import('./packages/qwik/src/testing/platform');
  const { setPlatform } = await import('./packages/qwik/src/core/platform/platform');
  setPlatform(getTestPlatform() as any);
});
