import { createAsync$ } from '@qwik.dev/core';

export const userData = createAsync$(async () => {
  return { name: 'A' };
});
