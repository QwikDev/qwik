import { component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';

export const EagerTransitiveBlock = component$(() => {
  const result = useSignal('pending');

  useVisibleTask$(async () => {
    try {
      const { getEagerTransitiveStatus } = await import('./eager-transitive-server-fn');
      result.value = await getEagerTransitiveStatus();
    } catch {
      result.value = 'failed';
    }
  });

  return <p id="eager-transitive-result">{result.value}</p>;
});
