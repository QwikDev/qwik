import { component$, Slot } from '@qwik.dev/core';
import type { RequestHandler } from '@qwik.dev/router';

export const onRequest: RequestHandler = ({ url, headers, sharedMap }) => {
  if (url.searchParams.get('csp') === 'nonce') {
    const nonce = crypto.randomUUID();
    sharedMap.set('@nonce', nonce);
    headers.set('Content-Security-Policy', `script-src 'nonce-${nonce}' 'strict-dynamic'`);
  }
};

export default component$(() => (
  <main>
    <h1 id="catch-title">Error handling e2e</h1>
    <Slot />
    <footer id="catch-footer">Footer shell</footer>
  </main>
));
