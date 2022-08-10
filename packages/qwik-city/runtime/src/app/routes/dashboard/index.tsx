import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '~qwik-city-runtime';

export default component$(() => {
  return (
    <div>
      <h1>Dashboard</h1>
      <p>
        <a href="/sign-out">Sign Out</a>
      </p>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Home',
};
