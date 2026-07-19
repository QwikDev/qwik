import type { DocumentHead } from '@qwik.dev/router';
import { component$, useSignal } from '@qwik.dev/core';
import { loadSecret } from '../db.server';

export default component$(() => {
  const count = useSignal(0);
  return (
    <main>
      <h1>Hi</h1>
      <button onClick$={() => count.value++}>Increment</button>
      <span>{loadSecret()}</span>
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Server-only rejected',
};
