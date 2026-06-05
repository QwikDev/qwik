import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useData = routeLoader$(() => {
  return 'data-c';
});

export default component$(() => {
  const data = useData();
  return (
    <div>
      <h1 id="double-nav-c">Route C</h1>
      <span id="double-nav-c-data">{data.value}</span>
    </div>
  );
});
