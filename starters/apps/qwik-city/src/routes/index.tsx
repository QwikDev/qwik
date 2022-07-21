import { component$, Host } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';

export default component$(() => {
  return (
    <Host>
      <h1 onClick$={() => console.warn('hola')}>Welcome to Qwik City</h1>

      <p>The meta-framework for Qwik.</p>
    </Host>
  );
});

export const head: DocumentHead = {
  title: 'Welcome to Qwik City',
};
