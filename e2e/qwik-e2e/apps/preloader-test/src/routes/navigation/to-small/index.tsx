import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';

export default component$(() => (
  <section class="fixture" data-fixture="navigation/to-small">
    <h2>small page</h2>
    <output data-testid="result" data-done>
      small
    </output>
  </section>
));

export const head: DocumentHead = { title: 'small page' };
