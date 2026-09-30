import { createComputed$ } from '@qwik.dev/core';

export const userData = createComputed$(async () => {
  return { name: 'A' };
});
