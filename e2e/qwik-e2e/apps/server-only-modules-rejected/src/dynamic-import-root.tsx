import { component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';

export default component$(() => {
  const secret = useSignal('');

  useVisibleTask$(async () => {
    const module = await import('./db.server');
    secret.value = module.loadSecret();
  });

  return <main>{secret.value}</main>;
});
