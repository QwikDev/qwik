import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  return (
    <main>
      <h1>Action Source</h1>
      <Link id="to-scroll-action" href="/qwikrouter-test/scroll-restoration/action-form/">
        To Action Form
      </Link>
    </main>
  );
});
