import { server$ } from '@qwik.dev/router';

export const ping = server$(async function () {
  return 'pong:no-args';
});
