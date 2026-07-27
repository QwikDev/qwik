import { component$, ErrorBoundary, isServer } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import { resetFallback } from '../../components/error-boundary/error-boundary';

export const useLoaderResetData = routeLoader$(() => ({ message: 'loader-reset-data' }));

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
