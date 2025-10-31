import { component$ } from '@qwik.dev/core';
import { type DocumentHead } from '@qwik.dev/router';

export default component$(() => {
  return <>render qwik</>;
});

export const head: DocumentHead = {
  title: 'Welcome to Qwik',
  meta: [
    {
      name: 'description',
      content: 'Qwik site description',
    },
  ],
};
