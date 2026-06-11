import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

const useError = routeLoader$(async function ({ error }): Promise<string> {
  throw error(401, 'loader-error-uncaught');
});

export default component$(() => {
  // A thrown error() aborts the request: it propagates to middleware (plugin@errors
  // rewrites the payload) and the error page renders — this component never does.
  useError();
  return <></>;
});
