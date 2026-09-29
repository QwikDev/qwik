import { component$ } from '@qwik.dev/core';
import { Link, type DocumentHead } from '@qwik.dev/router';

export default component$(() => (
  <main>
    <h1>Head error source</h1>
    <Link id="head-error-link" href="/qwikrouter-test/head-error/crash/">
      Navigate to the failing head
    </Link>
  </main>
));

export const head: DocumentHead = {
  title: 'Head error source',
};
