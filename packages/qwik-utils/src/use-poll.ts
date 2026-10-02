import { useVisibleTask$, type ComputedSignal } from '@qwik.dev/core';

/** Smallest allowed poll interval, so a `0` or negative `expires` can't spin the event loop. */
const MIN_EXPIRES_MS = 5;

/**
 * Poll a computed/async signal: invalidate it every `expires` milliseconds so it recomputes. The
 * signal is returned so it can be wrapped inline.
 *
 * Polling starts once the document is idle and is client-only. Polling continues after a failed
 * computation. `expires` is clamped to 5ms.
 *
 * Multiple components may call `usePoll` on the same signal; the redundant timers are harmless.
 *
 * @public
 */
export const usePoll = <T>(signal: ComputedSignal<T>, expires: number): ComputedSignal<T> => {
  useVisibleTask$(({ cleanup }) => startPolling(signal, expires, cleanup), {
    strategy: 'document-idle',
  });
  return signal;
};

export const startPolling = (
  signal: ComputedSignal,
  expires: number,
  cleanup: (callback: () => void) => void
) => {
  const intervalId = setInterval(() => signal.invalidate(), Math.max(expires, MIN_EXPIRES_MS));
  cleanup(() => clearInterval(intervalId));
};
