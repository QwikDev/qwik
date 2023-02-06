import { component$ } from '@builder.io/qwik';
import { DocumentHead, Link } from '@builder.io/qwik-city';

export default component$(() => {
  return (
    <div>
      <h1 onClick$={() => console.warn('hola')}>Welcome to Qwik City</h1>
      <p>The meta-framework for Qwik.</p>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Welcome to Qwik City',
};
