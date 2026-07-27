import { $, component$, ErrorBoundary, isServer, type QRL } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
// Relative (not `~`) so the prod twin can re-export this module across app roots.
import { errMsg } from '../../components/error-boundary/error-boundary';

export const useLoaderResetData = routeLoader$(() => ({ message: 'loader-reset-data' }));

const resetFallback = $((e: unknown, reset: QRL<() => void>) => (
  <section id="eb-fallback">
    <p id="eb-fallback-msg">caught: {errMsg(e)}</p>
    <button id="eb-reset" onClick$={() => reset()}>
      Retry
    </button>
  </section>
));

// Throws only during SSR; after reset the client re-renders and shows the loader data.
// A client reset() must re-render off the serialized loader, so it must issue no loader request.
const LoaderResetChild = component$(() => {
  const data = useLoaderResetData();
  if (isServer) {
    throw new Error('loader-reset boom');
  }
  return <div id="eb-content">recovered: {data.value.message}</div>;
});

export default component$(() => (
  <ErrorBoundary fallback$={resetFallback}>
    <LoaderResetChild />
  </ErrorBoundary>
));
