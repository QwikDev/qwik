import { component$, ErrorBoundary, useSignal } from '@qwik.dev/core';
import { EbFallback, errMsg } from '../../components/error-boundary/error-boundary';

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
  <ErrorBoundary fallback$={(e) => <EbFallback id="eb-outer" msg={errMsg(e)} />}>
    <div id="eb-outer-ok">outer ok</div>
    <ErrorBoundary fallback$={(e) => <EbFallback id="eb-inner" msg={errMsg(e)} />}>
      <ThrowOnClick idPrefix="eb-inner" message="inner client boom" />
      <div id="eb-content">content ok</div>
    </ErrorBoundary>
  </ErrorBoundary>
));
