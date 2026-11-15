import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';

export default component$(() => {
  return (
    <section class="intro">
      <h1>Preloader test</h1>
      <p>One route per JS streaming case. To watch one by hand:</p>
      <ol>
        <li>
          Run <code>pnpm build.core</code>, then <code>pnpm preview</code> in this app.
        </li>
        <li>In DevTools Network, pick 3G, disable the cache and show the Priority column.</li>
        <li>
          Open a route and click its trigger while preloads still run. Each new block of requests
          after the click is a round trip.
        </li>
      </ol>
    </section>
  );
});

export const head: DocumentHead = {
  title: 'Preloader test',
};
