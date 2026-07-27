import { $, component$, ErrorBoundary, isServer, type JSXOutput, type QRL } from '@qwik.dev/core';
import { errMsg } from '../../components/error-boundary/error-boundary';

const resetFallback = $((e: unknown, reset: QRL<() => void>) => (
  <section id="eb-fallback">
    <p id="eb-fallback-msg">caught: {errMsg(e)}</p>
    <button id="eb-reset" onClick$={() => reset()}>
      Retry
    </button>
  </section>
));

// New route (no god-file antecedent): child always throws, so every reset re-derives
// the fallback; the window counter proves repeated resets stay bounded.
const EbAlwaysThrower = component$((): JSXOutput => {
  throw new Error('eb reset-loop boom');
});

export default component$(() => (
  <ErrorBoundary
    fallback$={resetFallback}
    onError$={$(() => {
      if (!isServer) {
        (window as any).__ebResetLoopRuns = ((window as any).__ebResetLoopRuns ?? 0) + 1;
      }
    })}
  >
    <EbAlwaysThrower />
  </ErrorBoundary>
));
