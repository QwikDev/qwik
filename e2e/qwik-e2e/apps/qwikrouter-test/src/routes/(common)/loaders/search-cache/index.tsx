import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  return (
    <main>
      <Link
        id="link-search-cache-alpha"
        href="/qwikrouter-test/loaders/search-cache/alpha/?keep=one&noise=first"
      >
        Alpha
      </Link>
    </main>
  );
});
