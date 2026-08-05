import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

// Returns the redirect signal instead of throwing it.
export const useRedirectLoader = routeLoader$(({ redirect }) =>
  redirect(302, '/qwikrouter-test/returned-control-flow/target/')
);

export default component$(() => {
  useRedirectLoader();
  return <h1 id="returned-control-flow-loader-redirect">Should not render</h1>;
});
