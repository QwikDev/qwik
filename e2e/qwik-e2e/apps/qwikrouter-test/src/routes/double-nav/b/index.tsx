import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useData = routeLoader$(() => {
  return 'data-b';
});

export default component$(() => {
  const data = useData();
  return (
    <div>
      <h1 id="double-nav-b">Route B</h1>
      <span id="double-nav-b-data">{data.value}</span>
    </div>
  );
});
