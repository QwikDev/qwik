import { useVisibleTask$, type ComputedSignal } from '@qwik.dev/core';

/**
 * Poll a computed/async signal: invalidate it every `expires` milliseconds so it recomputes.
 *
 * Polling starts once the document is idle and is client-only. The timer resets whenever a new
 * result lands (the `pending` flip), so `expires` counts from the last result, not from mount.
 * Polling continues after a failed computation.
 *
 * Multiple components may call `usePoll` on the same signal; the redundant timers are harmless.
 *
 * @public
 */
export const usePoll = (signal: ComputedSignal<unknown>, expires: number) => {
  useVisibleTask$(
    ({ track, cleanup }) => {
      const pending = track(() => signal.pending);
      track(() => signal.error);
      if (!pending) {
        // Interval, not timeout: a recompute that never flips `pending` (sync compute,
        // injected value) would otherwise stop the poll after one tick.
        const intervalId = setInterval(() => signal.invalidate(), expires);
        cleanup(() => clearInterval(intervalId));
      }
    },
    { strategy: 'document-idle' }
  );
};
