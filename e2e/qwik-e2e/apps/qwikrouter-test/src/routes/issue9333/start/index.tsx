import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => (
  <main>
    <h1 id="issue9333-start">Start</h1>
    <Link
      id="issue9333-redirect-link"
      href="/qwikrouter-test/issue9333/redirecting/"
      prefetch={false}
    >
      Redirect
    </Link>
  </main>
));
