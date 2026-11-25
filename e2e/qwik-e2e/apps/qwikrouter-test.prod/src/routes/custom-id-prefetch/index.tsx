import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => (
  <>
    <Link
      href="/qwikrouter-test.prod/custom-id-prefetch/target/"
      prefetchData="intent"
      prefetchBundles="off"
    >
      Open target
    </Link>
    <Link
      href="/qwikrouter-test.prod/custom-id-prefetch/target"
      prefetchData="intent"
      prefetchBundles="off"
    >
      Open target without its slash
    </Link>
  </>
));
