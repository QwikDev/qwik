import { component$, isBrowser } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';

export default component$(() => <h1 id="head-error-target">Head error target</h1>);

export const head: DocumentHead = () => {
  if (isBrowser) {
    throw new Error('head error during SPA navigation');
  }
  return { title: 'Head error target' };
};
