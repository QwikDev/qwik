import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return (
    <a href="/" preventdefault:click onClick$={() => alert('do something else.')}>
      click me!
    </a>
  );
});
