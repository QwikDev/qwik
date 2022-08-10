import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '~qwik-city-runtime';

export default component$(() => {
  return (
    <div>
      <h1>Welcome to the Docs!</h1>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Welcome!',
};
