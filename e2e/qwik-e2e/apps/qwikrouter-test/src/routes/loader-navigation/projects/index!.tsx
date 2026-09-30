import { component$ } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';

export const useRewrittenData = routeLoader$(({ url }) => url.pathname, {
  id: 'navigation-rewritten',
});

export default component$(() => {
  const rewritten = useRewrittenData();
  return <h1>{rewritten.value}</h1>;
});
export const head: DocumentHead = ({ resolveValue }) => ({
  title: resolveValue(useRewrittenData),
});
