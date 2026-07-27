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

// New route (no god-file antecedent): SSR throws so the fallback resumes; the
// client render heals on reset, so content replaces the fallback without re-erroring.
const EbHealOnce = component$((): JSXOutput => {
  if (isServer) {
    throw new Error('eb heal ssr boom');
  }
  return <p id="eb-heal-recovered">healed</p>;
});

export default component$(() => (
  <ErrorBoundary fallback$={resetFallback}>
    <EbHealOnce />
  </ErrorBoundary>
));
