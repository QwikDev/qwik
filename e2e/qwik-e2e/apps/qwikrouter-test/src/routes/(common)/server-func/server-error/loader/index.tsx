import { component$ } from '@qwik.dev/core';
import { routeLoader$, server$ } from '@qwik.dev/router';
import { HttpError } from '@qwik.dev/router/middleware/request-handler';

export const serverError = server$(() => {
  throw new HttpError(401, 'loader-error-data');
});

const useCatchServerErrorInLoader = routeLoader$(async () => {
  try {
    await serverError();
  } catch (err: any) {
    if (err instanceof HttpError && typeof err.data === 'string') {
      return err.data;
    }
  }

  return 'unknown error';
});

export default component$(() => {
  const error = useCatchServerErrorInLoader();
  return <div id="server-error">{error.value}</div>;
});
