import { component$ } from '@qwik.dev/core';
import { routeLoader$, server$ } from '@qwik.dev/router';
import { HttpError } from '@qwik.dev/router/middleware/request-handler';

export const serverError = server$(() => {
  throw new HttpError(401, 'server-error-data');
});

const useCatchServerErrorInLoader = routeLoader$(async () => {
  await serverError();
});

export default component$(() => {
  useCatchServerErrorInLoader();
  return <></>;
});
