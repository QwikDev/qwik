import { component$, ErrorBoundary, useSignal } from '@qwik.dev/core';
import { defaultFallback } from '../../components/error-boundary/error-boundary';

const ThrowOnClick = component$<{ idPrefix: string; message: string }>((props) => {
  const touched = useSignal(0);
  return (
    <>
      <button
        id={`${props.idPrefix}-throw`}
        onClick$={() => {
          touched.value++;
          throw new Error(props.message);
        }}
      >
        throw on click
      </button>
      <span id={`${props.idPrefix}-touched`}>{touched.value}</span>
    </>
  );
});

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
    <ThrowOnClick idPrefix="eb-onerror" message="onerror boom" />
    <div id="eb-content">content ok</div>
  </ErrorBoundary>
));
