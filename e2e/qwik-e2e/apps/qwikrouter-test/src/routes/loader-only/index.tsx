import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => (
  <Link id="loader-only-link" href="/qwikrouter-test/loader-only/redirect/">
    Route that only redirects from a loader
  </Link>
));
