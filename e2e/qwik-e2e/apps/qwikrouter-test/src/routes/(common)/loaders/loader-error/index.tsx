import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

const useError = routeLoader$(async function ({ error }): Promise<string> {
  throw error(401, 'loader-error-uncaught');
});

export default component$(() => {
  // Lazy data-only loader: it fails, but nothing reads its value, so SSR is unaffected.
  useError();
  return <div id="loader-error-rendered">rendered</div>;
});
