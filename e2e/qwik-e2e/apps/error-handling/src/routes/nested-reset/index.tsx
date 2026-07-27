import { $, component$, ErrorBoundary, useSignal, type QRL } from '@qwik.dev/core';
import { EbFallback, EbSyncThrower, errMsg } from '../../components/error-boundary/error-boundary';

const resetFallback = $((e: unknown, reset: QRL<() => void>) => (
  <section id="eb-fallback">
    <p id="eb-fallback-msg">caught: {errMsg(e)}</p>
    <button id="eb-reset" onClick$={() => reset()}>
      Retry
    </button>
  </section>
));

export default component$(() => {
  const touched = useSignal(0);
  return (
    <ErrorBoundary fallback$={(e) => <EbFallback id="eb-outer" msg={errMsg(e)} />}>
      <section id="eb-outer-ok">
        <p>outer ok</p>
        <button id="eb-outer-ok-button" onClick$={() => touched.value++}>
          Touch outer
        </button>
        <span id="eb-outer-ok-count">{touched.value}</span>
      </section>
      <ErrorBoundary fallback$={resetFallback}>
        <EbSyncThrower />
      </ErrorBoundary>
    </ErrorBoundary>
  );
});
