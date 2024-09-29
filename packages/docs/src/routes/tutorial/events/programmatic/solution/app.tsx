import { component$, useOn, $ } from '@qwik.dev/core';

export default component$(() => {
  useOn(
    'click',
    $(() => alert('Hello World!'))
  );

  return <p>App Component. Click me.</p>;
});
