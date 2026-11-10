import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => (
  <Link
    href="/qwikrouter-test.prod/group-loader/area/page/"
    prefetchData="off"
    prefetchBundles="off"
  >
    Open group page
  </Link>
));
