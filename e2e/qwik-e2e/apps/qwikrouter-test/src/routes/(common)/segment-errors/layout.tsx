import { component$, Slot } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useSectionData = routeLoader$(() => 'section data');

export default component$(() => {
  const sectionData = useSectionData();
  return (
    <section>
      <p id="section-data">{sectionData.value}</p>
      <Slot />
    </section>
  );
});
