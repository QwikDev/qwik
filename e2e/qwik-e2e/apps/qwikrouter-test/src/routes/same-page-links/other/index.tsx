import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  return (
    <div>
      <h1>Other Page</h1>
      <Link id="to-same-page-links" href="/qwikrouter-test/same-page-links/">
        Same page links
      </Link>
    </div>
  );
});
