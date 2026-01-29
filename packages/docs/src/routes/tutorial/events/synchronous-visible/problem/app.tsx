import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return (
    <a href="/" onClick$={() => window.open('http://qwik.dev')}>
      click me!
    </a>
  );
});
