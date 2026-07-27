import { component$, Slot } from '@qwik.dev/core';

// Shell markers (eb-title, eb-footer) live outside the boundary so they survive the SSR swap.
export default component$(() => (
  <main>
    <h1 id="eb-title">Error handling e2e</h1>
    <Slot />
    <footer id="eb-footer">Footer shell</footer>
  </main>
));
