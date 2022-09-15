import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '~qwik-city-runtime';

export default component$(() => {
  return (
    <div>
      <h1>Welcome to the Docs!</h1>

      <p>
        <a href="/docs/">Docs link with trailing slash (should redirect without slash)</a>
      </p>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Welcome!',
};
