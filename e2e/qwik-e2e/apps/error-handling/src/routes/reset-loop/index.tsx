import { $, component$, ErrorBoundary, isServer } from '@qwik.dev/core';
import { EbAlwaysThrower, resetFallback } from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <ErrorBoundary
    fallback$={resetFallback}
    onError$={$(() => {
      if (!isServer) {
        (window as any).__ebResetLoopRuns = ((window as any).__ebResetLoopRuns ?? 0) + 1;
      }
    })}
  >
    <EbAlwaysThrower message="eb reset-loop boom" />
  </ErrorBoundary>
));
