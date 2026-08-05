import { component$, ErrorBoundary } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import { defaultFallback } from '../../components/error-boundary/error-boundary';

export const useThrowingLoader = routeLoader$(async () => {
  throw new Error('loader-throw-boom');
});

const UnguardedConsumer = component$(() => {
  const data = useThrowingLoader();
  return <p id="loader-error-value">value: {String(data.value)}</p>;
});

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <UnguardedConsumer />
  </ErrorBoundary>
));
