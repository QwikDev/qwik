import type { ComputedSignal } from '@qwik.dev/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPolling } from './use-poll';

describe('startPolling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clamps the interval and stops it during cleanup', () => {
    vi.useFakeTimers();
    const signal = { invalidate: vi.fn() } as unknown as ComputedSignal;
    let cleanup = () => {};

    startPolling(signal, 0, (callback) => (cleanup = callback));
    vi.advanceTimersByTime(10);
    expect(signal.invalidate).toHaveBeenCalledTimes(2);

    cleanup();
    vi.advanceTimersByTime(10);
    expect(signal.invalidate).toHaveBeenCalledTimes(2);
  });
});
