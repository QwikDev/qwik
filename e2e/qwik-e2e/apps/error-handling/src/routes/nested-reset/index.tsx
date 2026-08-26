import { component$, ErrorBoundary, useSignal } from '@qwik.dev/core';
import {
  EbSyncThrower,
  outerFallback,
  resetFallback,
} from '../../components/error-boundary/error-boundary';

export default component$(() => {
  const touched = useSignal(0);
  return (
    <ErrorBoundary fallback$={outerFallback}>
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
