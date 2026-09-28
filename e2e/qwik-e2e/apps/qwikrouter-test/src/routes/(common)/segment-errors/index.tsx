import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  return (
    <div id="segment-errors-index">
      <Link id="to-layout-guard" href="/qwikrouter-test/segment-errors/layout-guard/">
        layout guard
      </Link>
      <Link id="to-layout-middleware" href="/qwikrouter-test/segment-errors/layout-middleware/">
        layout middleware
      </Link>
    </div>
  );
});
