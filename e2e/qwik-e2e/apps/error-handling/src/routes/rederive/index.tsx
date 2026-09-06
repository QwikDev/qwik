import { $, component$, ErrorBoundary, isServer } from '@qwik.dev/core';
import { EbAlwaysThrower, resetFallback } from '../../components/error-boundary/error-boundary';

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
