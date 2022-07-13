import { component$, Host } from '@builder.io/qwik';
import type { DocumentHead } from '../../library/types';

export default component$(() => {
  return (
    <Host>
      <h1>Welcome to Qwik City</h1>

      <p>The meta-framework for Qwik.</p>
    </Host>
  );
});

export const head: DocumentHead = {
  title: 'Welcome to Qwik City',
};
