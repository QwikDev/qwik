import { component$, ErrorBoundary } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import { defaultFallback } from '../../components/error-boundary/error-boundary';

export const useLoader500 = routeLoader$(({ error }) => {
  throw error(500, 'loader-500-boom');
});

const LoaderConsumer = component$(() => {
  useLoader500();
  return <h1 id="loader-500-body">Should not render</h1>;
});

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <LoaderConsumer />
  </ErrorBoundary>
));
