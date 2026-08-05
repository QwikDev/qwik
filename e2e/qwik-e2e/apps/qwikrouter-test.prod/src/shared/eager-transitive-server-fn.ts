import { server$ } from '@qwik.dev/router';

const getEagerTransitiveStatusServer = server$(async function () {
  return 'registered';
});

export async function getEagerTransitiveStatus() {
  return getEagerTransitiveStatusServer();
}
