import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useTargetData = routeLoader$(() => {
  return 'target-data';
});

export default component$(() => {
  const data = useTargetData();
  return (
    <div>
      <h1 id="loader-redirect-target">Redirect Target</h1>
      <span id="loader-redirect-target-data">{data.value}</span>
    </div>
  );
});
