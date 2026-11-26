import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useTargetData = routeLoader$(() => 'Loaded');

export default component$(() => {
  const data = useTargetData();
  return <h1 id="redirect-action-target">{data.value}</h1>;
});
