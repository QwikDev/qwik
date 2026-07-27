import { component$, ErrorBoundary, useSignal } from '@qwik.dev/core';
import { EbFallback, EbSyncThrower, errMsg } from '../../components/error-boundary/error-boundary';

const ThrowOnClick = component$<{ idPrefix: string; message: string; label?: string }>((props) => {
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
        {props.label ?? 'throw on click'}
      </button>
      <span id={`${props.idPrefix}-touched`}>{touched.value}</span>
    </>
  );
});

export default component$(() => (
  <ErrorBoundary fallback$={(e) => <EbFallback id="eb-outer" msg={errMsg(e)} />}>
    <ThrowOnClick idPrefix="eb-outer" message="outer click boom" label="trigger outer" />
    <ErrorBoundary fallback$={(e) => <EbFallback id="eb-inner" msg={errMsg(e)} />}>
      <EbSyncThrower />
    </ErrorBoundary>
  </ErrorBoundary>
));
