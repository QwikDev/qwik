import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useTarget = routeLoader$(({ originalUrl, url }) => ({
  original: originalUrl.pathname,
  served: url.pathname,
}));

export default component$(() => {
  const target = useTarget();
  return (
    <>
      <h1 id="rewrite-spa-target">rewrite spa: target</h1>
      <p id="rewrite-spa-original">{target.value.original}</p>
      <p id="rewrite-spa-served">{target.value.served}</p>
    </>
  );
});
