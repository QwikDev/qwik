import { component$ } from '@qwik.dev/core';

export default component$(() => {
  return (
    <a
      href="/"
      onClick$={(event) => {
        if (event.ctrlKey) {
          event.preventDefault();
        }
        console.log('clicked');
      }}
    >
      click me!
    </a>
  );
});
