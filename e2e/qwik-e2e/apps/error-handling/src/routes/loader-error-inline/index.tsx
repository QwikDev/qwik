import { component$, ErrorBoundary } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import { defaultFallback } from '../../components/error-boundary/error-boundary';

export const useFailingLoader = routeLoader$(async () => {
  throw new Error('loader-inline-boom');
});

const GuardedConsumer = component$(() => {
  const data = useFailingLoader();
  if (data.error) {
    const digest = (data.error as Error & { digest?: string }).digest;
    return (
      <p id="loader-error-inline">
        inline: {data.error.message}
        {digest && <code id="loader-error-digest">{digest}</code>}
      </p>
    );
  }
  return <p id="loader-error-value">value: {String(data.value)}</p>;
});

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <GuardedConsumer />
  </ErrorBoundary>
));
