import { component$ } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';

export const useGreeting = routeLoader$(() => 'loaded');

export default component$(() => {
  const greeting = useGreeting();
  return (
    <section class="fixture" data-fixture="navigation/to-data">
      <h2>page with a routeLoader$</h2>
      <output data-testid="result" data-done="">
        {greeting.value}
      </output>
    </section>
  );
});

export const head: DocumentHead = { title: 'page with a routeLoader$' };
