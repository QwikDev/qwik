import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$ } from '@qwik.dev/router';

export const useData = routeLoader$(() => 'b');

export default component$(() => (
  <Link id="issue8966-c" href="/qwikrouter-test.prod/issue8966/c/">
    C
  </Link>
));
