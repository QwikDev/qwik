import { component$ } from '@qwik.dev/core';

export default component$(() => {
  return (
    <a href="/" preventdefault:click onClick$={() => alert('do something else.')}>
      click me!
    </a>
  );
});
