import { routeLoader$ } from '@qwik.dev/router';

// No default export: the route exists only to redirect.
export const useRedirect = routeLoader$((ev) => {
  throw ev.redirect(302, '/qwikrouter-test/loader-only/target/');
});
