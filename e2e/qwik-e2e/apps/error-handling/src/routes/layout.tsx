import { component$, Slot } from '@qwik.dev/core';

export default component$(() => (
  <main>
    <h1 id="catch-title">Error handling e2e</h1>
    <Slot />
    <footer id="catch-footer">Footer shell</footer>
  </main>
));
