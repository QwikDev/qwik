import { $, component$, ErrorBoundary, type QRL } from '@qwik.dev/core';
import { EbContent, errMsg } from '../../components/error-boundary/error-boundary';

const resetFallback = $((e: unknown, reset: QRL<() => void>) => (
  <section id="eb-fallback">
    <p id="eb-fallback-msg">caught: {errMsg(e)}</p>
    <button id="eb-reset" onClick$={() => reset()}>
      Retry
    </button>
  </section>
));

export default component$(() => (
  <ErrorBoundary fallback$={resetFallback}>
    <EbContent />
    <button
      id="eb-csr-throw"
      onClick$={() => {
        throw new Error('csr reset boom');
      }}
    >
      throw on click
    </button>
  </ErrorBoundary>
));
