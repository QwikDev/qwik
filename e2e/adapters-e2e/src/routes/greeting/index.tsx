import { component$ } from '@qwik.dev/core';
import { greeting } from '~/greeting';

export default component$(() => {
  return <p id="greeting">{greeting()}</p>;
});
