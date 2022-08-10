import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '~qwik-city-runtime';

export default component$(() => {
  return (
    <div>
      <h1>Settings</h1>
      <p>My Settings</p>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Settings',
};
