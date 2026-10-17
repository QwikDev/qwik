import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  return (
    <>
      <h1 id="rewrite-spa-source">rewrite spa: source</h1>
      <Link href="/qwikrouter-test/rewrite-spa/pretty/" data-test-link="rewrite-spa-pretty">
        pretty URL, no route of its own, rewritten to a different route
      </Link>
    </>
  );
});
