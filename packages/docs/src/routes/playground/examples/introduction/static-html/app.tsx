import { component$ } from '@qwik.dev/core';

// Nothing here is interactive, so the browser gets plain HTML.
export default component$(() => {
  return (
    <main>
      <h1>Static content</h1>
      <p>
        This component has no event handlers or reactive state, so no component code is sent to the
        browser.
      </p>
      <p>Select the HTML tab to see what the server rendered.</p>
    </main>
  );
});
