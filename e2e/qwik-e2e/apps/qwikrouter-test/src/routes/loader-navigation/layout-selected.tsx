import { component$, Slot } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useSelectedData = routeLoader$(() => 'selected layout', { id: 'lifecycle-selected' });

export default component$(() => {
  const selected = useSelectedData();
  return (
    <>
      <output id="selected-layout-value">{selected.value}</output>
      <Slot />
    </>
  );
});
