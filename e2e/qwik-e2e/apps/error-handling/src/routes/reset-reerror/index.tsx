import {
  $,
  component$,
  ErrorBoundary,
  isServer,
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

// `window` counter survives boundary re-creation across resets.
const EbReErrorAsync = component$(() => {
  if (isServer) {
    return new Promise<JSXOutput>((_resolve, reject) => {
      setTimeout(() => reject(new Error('eb reerror ssr boom')), 50);
    }) as unknown as JSXOutput;
  }
  const runs = ((window as any).__ebReErrorRuns = ((window as any).__ebReErrorRuns ?? 0) + 1);
  if (runs < 2) {
    throw new Error('eb reerror client boom ' + runs);
  }
  return <p id="eb-reerror-recovered">recovered after {runs} runs</p>;
});

export default component$(() => (
  <Suspense fallback={<span id="eb-skel">loading</span>}>
    <ErrorBoundary fallback$={resetFallback}>
      <EbReErrorAsync />
    </ErrorBoundary>
  </Suspense>
));
