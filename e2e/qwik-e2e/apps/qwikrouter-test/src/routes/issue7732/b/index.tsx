import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import type { RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler<void> = ({ redirect }) => {
  throw redirect(302, `/qwikrouter-test/issue7732/c/?redirected=true`);
};

// A routeLoader$ on this route ensures SPA navigation fetches from this path,
// triggering the onGet middleware above.
export const useRouteCheck = routeLoader$(() => null);

export default component$(() => {
  return <div>B route with redirect</div>;
});
