import { component$, Host } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';

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
  title: 'Dashboard',
};
