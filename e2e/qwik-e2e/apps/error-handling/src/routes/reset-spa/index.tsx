import {
  component$,
  ErrorBoundary,
  isServer,
  Suspense,
  useSignal,
  type JSXOutput,
} from '@qwik.dev/core';
import { EbReErrorAsync, resetFallback } from '../../components/error-boundary/error-boundary';

export default component$(() => {
  const spaShow = useSignal(false);
  return (
    <>
      <button id="eb-spa-show" onClick$={() => (spaShow.value = true)}>
        Show
      </button>
      {spaShow.value ? (
        <Suspense fallback={<span id="eb-skel">loading</span>}>
          <ErrorBoundary fallback$={resetFallback}>
            <EbReErrorAsync />
          </ErrorBoundary>
        </Suspense>
      ) : null}
    </>
  );
});
