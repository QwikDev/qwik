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

// Throws in BOTH environments: reset re-derives the same failure.
const EbAlwaysThrower = component$((): JSXOutput => {
  throw new Error('eb always boom');
});

export default component$(() => (
  <ErrorBoundary
    fallback$={resetFallback}
    onError$={$(() => {
      if (!isServer) {
        (window as any).__ebRederiveRuns = ((window as any).__ebRederiveRuns ?? 0) + 1;
      }
    })}
  >
    <EbAlwaysThrower />
  </ErrorBoundary>
));
