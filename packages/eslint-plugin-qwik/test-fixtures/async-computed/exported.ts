import { createAsyncComputed$ } from '@qwik.dev/core';

export const userData = createAsyncComputed$(async () => {
  return { name: 'A' };
});
