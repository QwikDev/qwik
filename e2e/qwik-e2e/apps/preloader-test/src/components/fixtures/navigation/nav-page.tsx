import { component$ } from '@qwik.dev/core';

export const NavPage = component$<{ fixture: string }>(({ fixture }) => (
  <section class="fixture" data-fixture={fixture}>
    <h2>{fixture}</h2>
    <output data-testid="result" data-done>
      shown
    </output>
  </section>
));
