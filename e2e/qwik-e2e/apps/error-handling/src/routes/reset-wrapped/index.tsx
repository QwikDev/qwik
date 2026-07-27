import {
  $,
  component$,
  ErrorBoundary,
  isServer,
  Slot,
  Suspense,
  type JSXOutput,
  type QRL,
} from '@qwik.dev/core';
import { errMsg } from '../../components/error-boundary/error-boundary';

const resetFallback = $((e: unknown, reset: QRL<() => void>) => (
  <section id="eb-fallback">
    <p id="eb-fallback-msg">caught: {errMsg(e)}</p>
    <button id="eb-reset" onClick$={() => reset()}>
      Retry
    </button>
  </section>
));

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

export default component$(() => (
  <Suspense fallback={<span id="eb-skel">loading</span>}>
    <EbWrapper>
      <ErrorBoundary fallback$={resetFallback}>
        <EbWrapAsync />
      </ErrorBoundary>
    </EbWrapper>
  </Suspense>
));
