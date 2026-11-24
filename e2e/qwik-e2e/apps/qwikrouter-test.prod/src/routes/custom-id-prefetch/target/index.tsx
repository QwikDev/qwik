import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useTarget = routeLoader$(() => ({ title: 'Custom id target' }), {
  id: 'custom-id-prefetch',
});

export default component$(() => {
  const target = useTarget();
  return <h1>{target.value.title}</h1>;
});
