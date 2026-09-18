import { component$, Slot } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useSelectedData = routeLoader$(() => 'selected layout', { id: 'lifecycle-selected' });

export default component$(() => (
  <>
    <output id="selected-layout-value">{useSelectedData().value}</output>
    <Slot />
  </>
));
