import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  return (
    <div>
      <h1>Same Page Links</h1>
      <a id="same-path" href="/qwikrouter-test/same-page-links/">
        This page
      </a>
      <a id="hash" href="#target">
        Target on this page
      </a>
      <Link id="to-other" href="/qwikrouter-test/same-page-links/other/">
        Other page
      </Link>
      <h2 id="target">Target</h2>
    </div>
  );
});
