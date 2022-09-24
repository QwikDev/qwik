import { component$, useStore } from '@builder.io/qwik';
import type { DocumentHead } from '../../library/types';

export default component$(() => {
  const state = useStore({
    count: 0,
  });
  if (state.count > 0) {
    throw new Error('hola');
  }
  return (
    <div>
      <h1
        onClick$={() => {
          console.warn('hola');
          state.count++;
        }}
      >
        Welcome to Qwik City {state.count}
      </h1>

      <p>The meta-framework for Qwik.</p>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Welcome to Qwik City',
};
