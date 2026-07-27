import { component$, ErrorBoundary } from '@qwik.dev/core';
import { defaultFallback, EbThrowOnClick } from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <ErrorBoundary
    fallback$={defaultFallback}
    onError$={(e, info) => {
      (window as any).__ebOnErrorRuns = ((window as any).__ebOnErrorRuns ?? 0) + 1;
      (window as any).__ebOnErrorMsg = (e as any)?.message ?? String(e);
      (window as any).__ebOnErrorPhase = info?.phase;
      (window as any).__ebOnErrorBoundaryId = info?.boundaryId;
    }}
  >
    <EbThrowOnClick idPrefix="eb-onerror" message="onerror boom" />
    <div id="eb-content">content ok</div>
  </ErrorBoundary>
));
