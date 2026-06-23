import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import type { RequestHandler } from '@qwik.dev/router';

export const onRequest: RequestHandler = ({ url, redirect }) => {
  if (url.searchParams.has('redirect')) {
    throw redirect(302, '/qwikrouter-test/loader-redirect/target/?done=true');
  }
};

export const useSourceData = routeLoader$(() => {
  return 'source-data';
});

export default component$(() => {
  const data = useSourceData();
  return (
    <div>
      <h1 id="loader-redirect-source">Source Route</h1>
      <span id="loader-redirect-source-data">{data.value}</span>
    </div>
  );
});
