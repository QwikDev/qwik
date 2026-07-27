import {
  component$,
  ErrorBoundary,
  isServer,
  Suspense,
  useSignal,
  type JSXOutput,
} from '@qwik.dev/core';
import { resetFallback } from '../../components/error-boundary/error-boundary';

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

// Boundary mounts on click, so there is no serialized resetOwner (client-first path).
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
