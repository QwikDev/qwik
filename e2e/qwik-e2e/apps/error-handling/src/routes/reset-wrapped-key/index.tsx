import { component$, ErrorBoundary, Suspense, useSignal } from '@qwik.dev/core';
import { EbWrapAsync, EbWrapper, errMsg } from '../../components/error-boundary/error-boundary';

export default component$(() => {
  const attempt = useSignal(0);
  return (
    <Suspense fallback={<span id="eb-skel">loading</span>}>
      <EbWrapper>
        <ErrorBoundary
          key={attempt.value}
          fallback$={(e) => (
            <section id="eb-fallback">
              <p id="eb-fallback-msg">caught: {errMsg(e)}</p>
              <button id="eb-reset" onClick$={() => attempt.value++}>
                Retry
              </button>
            </section>
          )}
        >
          <EbWrapAsync />
        </ErrorBoundary>
      </EbWrapper>
    </Suspense>
  );
});
