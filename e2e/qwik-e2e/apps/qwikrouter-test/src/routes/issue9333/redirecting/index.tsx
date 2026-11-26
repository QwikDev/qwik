import { component$ } from '@qwik.dev/core';
import { routeLoader$, type RequestHandler } from '@qwik.dev/router';

export const onRequest: RequestHandler = ({ redirect }) => {
  throw redirect(302, '/qwikrouter-test/issue9333/target/');
};

export const useRedirectingData = routeLoader$(() => 'redirecting');

export default component$(() => (
  <main>
    <h1 id="issue9333-redirecting">Redirecting route</h1>
  </main>
));
