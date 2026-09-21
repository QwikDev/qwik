import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$, type DocumentHead } from '@qwik.dev/router';

export const useChildData = routeLoader$(() => ({ hello: 'static child' }), {
  id: 'navigation-static-child',
});

export default component$(() => (
  <Link id="loader-parent" href="/qwikrouter-test/loader-navigation/" prefetch={false}>
    Parent
  </Link>
));

export const head: DocumentHead = ({ resolveValue }) => ({
  title: resolveValue(useChildData).hello,
});
