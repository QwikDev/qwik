import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Loads `log.ts` with `qTest` off, as an app would. */
const loadLog = async () => {
  vi.resetModules();
  (globalThis as any).qTest = false;
  try {
    return await import('./log');
  } finally {
    (globalThis as any).qTest = true;
  }
};

describe('logErrorAndStop in dev mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('logs the error on the server without rethrowing it', async () => {
    const { logErrorAndStop } = await loadLog();

    const error = logErrorAndStop('Cannot serialize function');

    expect(console.error).toHaveBeenCalledOnce();
    expect(error.message).toBe('Cannot serialize function');
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});
