import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const usePageSecret = routeLoader$(() => 'page secret');

export default component$(() => {
  const pageSecret = usePageSecret();
  return <p id="members-page">{pageSecret.value}</p>;
});
