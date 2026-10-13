import { component$, Catch, isServer } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import { resetFallback } from '../../components/catch/catch';

export const useLoaderResetData = routeLoader$(() => ({ message: 'loader-reset-data' }));

const LoaderResetChild = component$(() => {
  const data = useLoaderResetData();
  if (isServer) {
    throw new Error('loader-reset boom');
  }
  return <div id="catch-content">recovered: {data.value.message}</div>;
});

export default component$(() => (
  <Catch fallback$={resetFallback}>
    <LoaderResetChild />
  </Catch>
));
