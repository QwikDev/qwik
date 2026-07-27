import { component$, ErrorBoundary, useSignal, type Signal } from '@qwik.dev/core';
import { defaultFallback, EbContent } from '../../components/error-boundary/error-boundary';

// Increments `touched` BEFORE throwing so a blocked-import test can prove the handler never ran.
const EbThrowOnClick = component$<{ idPrefix: string; message: string; touched: Signal<number> }>(
  (props) => (
    <>
      <button
        id={`${props.idPrefix}-throw`}
        onClick$={() => {
          props.touched.value++;
          throw new Error(props.message);
        }}
      >
        throw on click
      </button>
      <span id={`${props.idPrefix}-touched`}>{props.touched.value}</span>
    </>
  )
);

export default component$(() => {
  const touched = useSignal(0);
  return (
    <ErrorBoundary fallback$={defaultFallback}>
      <EbContent />
      <EbThrowOnClick idPrefix="eb-content" message="happy click boom" touched={touched} />
    </ErrorBoundary>
  );
});
