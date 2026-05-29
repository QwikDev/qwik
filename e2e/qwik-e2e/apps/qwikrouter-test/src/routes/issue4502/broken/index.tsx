import { component$ } from '@qwik.dev/core';
import { routeLoader$, type RequestHandler } from '@qwik.dev/router';

// We need a routeLoader$ here to ensure the page is loaded via the loader URL (q-loader-*.json) which triggers the onRequest middleware.
export const useForceLoadingThisIndex = routeLoader$(() => null);

export const onRequest: RequestHandler<void> = async (onRequestArgs) => {
  const { redirect, url } = onRequestArgs;
  throw redirect(302, `${url.pathname}/route/`);
};

export default component$(() => {
  useForceLoadingThisIndex();
  return (
    <div id="index">
      You should be redirecting to <code>/broken/route</code>
    </div>
  );
});
