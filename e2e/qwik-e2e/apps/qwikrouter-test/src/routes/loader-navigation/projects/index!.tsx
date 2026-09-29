import { component$ } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';

export const useRewrittenData = routeLoader$(({ url }) => url.pathname, {
  id: 'navigation-rewritten',
});

export default component$(() => <h1>{useRewrittenData().value}</h1>);
export const head: DocumentHead = ({ resolveValue }) => ({
  title: resolveValue(useRewrittenData),
});
