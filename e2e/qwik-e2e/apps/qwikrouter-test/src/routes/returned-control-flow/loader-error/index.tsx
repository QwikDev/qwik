import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

// Returns the error signal instead of throwing it.
export const useErrorLoader = routeLoader$(({ error }) => error(401, 'returned-loader-error'));

export default component$(() => {
  useErrorLoader();
  return <h1 id="returned-control-flow-loader-error">Should not render</h1>;
});
