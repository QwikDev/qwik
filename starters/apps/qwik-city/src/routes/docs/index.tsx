import { component$, Host } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';

export default component$(() => {
  return (
    <Host>
      <h1>Welcome to the Docs!</h1>
    </Host>
  );
});

export const head: DocumentHead = {
  title: 'Welcome!',
};
