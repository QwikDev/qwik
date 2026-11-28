import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  return (
    <>
      <h1 id="rewrite-spa-source">rewrite spa: source</h1>
      <Link href="/qwikrouter-test/rewrite-spa/pretty/" data-test-link="rewrite-spa-pretty">
        pretty URL, no route of its own, rewritten to a different route
      </Link>
      <Link
        href="/qwikrouter-test/rewrite-spa/pretty-cached/"
        data-test-link="rewrite-spa-pretty-cached"
      >
        second pretty URL, same target
      </Link>
      <Link
        href="/qwikrouter-test/rewrite-spa/pretty/"
        rewrite="/qwikrouter-test/rewrite-spa/target/"
        data-test-link="rewrite-spa-pretty-hinted"
      >
        pretty URL whose link names the rewrite target
      </Link>
      <Link
        href="/qwikrouter-test/rewrite-spa/dynamic/one/"
        rewrite="/qwikrouter-test/rewrite-spa/dynamic/one/"
        data-test-link="rewrite-spa-dynamic-hinted"
      >
        a dynamic route whose link names itself as the target
      </Link>
    </>
  );
});
