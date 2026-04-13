import { component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';

export default component$(() => {
  const mounted = useSignal('pending');

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    mounted.value = 'mounted';
  });

  return <p>status: {mounted.value}</p>;
});
