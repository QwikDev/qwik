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
  <ErrorBoundary fallback$={defaultFallback}>
    <ThrowOnClick idPrefix="eb-last-resort" message="last-resort boom" />
    <div id="eb-content">content ok</div>
  </ErrorBoundary>
));
