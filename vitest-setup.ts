import { afterEach, beforeAll } from 'vitest';

// This has to run before qdev.ts loads. `beforeAll` is too late
globalThis.qTest = true;
globalThis.qRuntimeQrl = true;
globalThis.qDev = true;
globalThis.qInspector = false;

beforeAll(async () => {
  const { getTestPlatform } = await import('./packages/qwik/src/testing/platform');
  const { setPlatform } = await import('./packages/qwik/src/core/shared/platform/platform');
  setPlatform(getTestPlatform() as any);
});

afterEach(async () => {
  // Reset global cursor state to prevent leaks between tests.
  // Cursors from a hanging/errored test could block subsequent tests in the same worker.
  const { _resetGlobalCursorQueue } =
    await import('./packages/qwik/src/core/shared/cursor/cursor-queue');
  const { _resetTickScheduled } =
    await import('./packages/qwik/src/core/shared/cursor/cursor-walker');
  _resetGlobalCursorQueue();
  _resetTickScheduled();
});
