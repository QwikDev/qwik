import { component$ } from '@qwik.dev/core';
import type { RequestHandler } from '@qwik.dev/router';

// Returns the redirect signal from a request handler instead of throwing it.
export const onGet: RequestHandler = ({ redirect }) =>
  redirect(302, '/qwikrouter-test/returned-control-flow/target/');

export default component$(() => {
  return <h1 id="returned-control-flow-handler-redirect">Should not render</h1>;
});
