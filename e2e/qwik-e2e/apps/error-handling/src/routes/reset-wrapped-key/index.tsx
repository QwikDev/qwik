import {
  component$,
  ErrorBoundary,
  isServer,
  Slot,
  Suspense,
  useSignal,
  type JSXOutput,
} from '@qwik.dev/core';
import { errMsg } from '../../components/error-boundary/error-boundary';

const EbWrapper = component$(() => (
  <div data-eb-wrapper="">
    <Slot />
  </div>
));

const EbWrapAsync = component$(() => {
  if (isServer) {
    return new Promise<JSXOutput>((_resolve, reject) => {
      setTimeout(() => reject(new Error('eb wrap async boom')), 200);
    }) as unknown as JSXOutput;
  }
  return <p id="eb-wrap-recovered">recovered</p>;
});

export default component$(() => {
  // Bumping the boundary key remounts it, replacing reset() with a fresh render.
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
