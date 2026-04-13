import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useMessage = routeLoader$(() => {
  return { message: 'loaded from server' };
});

export default component$(() => {
  const data = useMessage();
  return <p>{data.value.message}</p>;
});
