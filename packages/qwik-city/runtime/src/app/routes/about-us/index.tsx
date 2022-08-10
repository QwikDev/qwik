import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '~qwik-city-runtime';

export default component$(() => {
  return (
    <div>
      <h1>About Us</h1>
      <p>
        <a href="/">Home</a>
      </p>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'About Us',
};
