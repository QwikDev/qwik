import { component$, Host } from '@builder.io/qwik';
import type { DocumentHead } from '~qwik-city-runtime';

export default component$(() => {
  return (
    <Host>
      <h1>Dashboard</h1>
      <p>
        <a href="/sign-out">Sign Out</a>
      </p>
    </Host>
  );
});

export const head: DocumentHead = {
  title: 'Home',
};
