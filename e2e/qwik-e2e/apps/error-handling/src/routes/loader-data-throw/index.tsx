import { component$, ErrorBoundary } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import { resetFallback } from '../../components/error-boundary/error-boundary';

export const useThrowingLoaderData = routeLoader$(() => ({
  shouldThrow: true,
  secret: 'loader-data-secret',
}));

const LoaderDataThrower = component$(() => {
  const data = useThrowingLoaderData();
  if (data.value.shouldThrow) {
    throw new Error('loader data boom: ' + data.value.secret);
  }
  return <div id="eb-content">content ok</div>;
});

export default component$(() => (
  <ErrorBoundary fallback$={resetFallback}>
    <LoaderDataThrower />
  </ErrorBoundary>
));
