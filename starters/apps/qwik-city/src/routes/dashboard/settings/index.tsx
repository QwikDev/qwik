import { component$, Host } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';

export default component$(() => {
  return (
    <Host>
      <h1>Settings</h1>
      <p>My Settings</p>
    </Host>
  );
});

export const head: DocumentHead = {
  title: 'Settings',
};
