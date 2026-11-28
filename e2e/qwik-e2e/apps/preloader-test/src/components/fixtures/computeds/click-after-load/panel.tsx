import { component$, useSignal, useVisibleTask$, type ReadonlySignal } from '@qwik.dev/core';

export const Panel = component$<{ total: ReadonlySignal<number> }>(({ total }) => {
  const shown = useSignal('');
  useVisibleTask$(({ track }) => {
    shown.value = `total ${track(total)}`;
  });
  return <p data-testid="panel">{shown.value || 'waiting'}</p>;
});
