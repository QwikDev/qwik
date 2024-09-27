import { component$, useOn, $ } from '@qwikdev/core';

export default component$(() => {
  useOn(
    'click',
    $(() => alert('Hello World!'))
  );

  return <p>App Component. Click me.</p>;
});
