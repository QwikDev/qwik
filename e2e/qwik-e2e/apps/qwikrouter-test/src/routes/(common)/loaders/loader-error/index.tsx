import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

const useError = routeLoader$(async function ({ error }): Promise<string> {
  throw error(401, 'loader-error-uncaught');
});

export default component$(() => {
  const loader = useError();
  // A loader that throws `error()` enters error state — read it via `loader.error`.
  if (loader.error) {
    return <div id="loader-error">{loader.error.message}</div>;
  }
  return <></>;
});
