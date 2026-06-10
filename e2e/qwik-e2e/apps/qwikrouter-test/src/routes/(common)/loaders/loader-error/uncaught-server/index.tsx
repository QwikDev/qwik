import { component$ } from '@qwik.dev/core';
import { routeLoader$, server$ } from '@qwik.dev/router';
import { ServerError } from '@qwik.dev/router/middleware/request-handler';

export const serverError = server$(() => {
  throw new ServerError(401, 'server-error-data');
});

const useCatchServerErrorInLoader = routeLoader$(async () => {
  await serverError();
});

export default component$(() => {
  const loader = useCatchServerErrorInLoader();
  // A ServerError thrown inside the loader (here, by a server$ call) enters error state.
  if (loader.error) {
    return <div id="loader-error">{loader.error.message}</div>;
  }
  return <></>;
});
