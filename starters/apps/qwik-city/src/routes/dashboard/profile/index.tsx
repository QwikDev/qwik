import { component$, Host } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';

export default component$(() => {
  return (
    <Host>
      <h1>Profile</h1>
      <p>My Profile</p>
    </Host>
  );
});

export const head: DocumentHead = {
  title: 'Profile',
};
