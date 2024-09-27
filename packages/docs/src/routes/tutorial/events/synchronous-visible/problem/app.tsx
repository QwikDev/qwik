import { component$ } from '@qwikdev/core';

export default component$(() => {
  return (
    <a href="/" onClick$={() => window.open('http://qwik.dev')}>
      click me!
    </a>
  );
});
