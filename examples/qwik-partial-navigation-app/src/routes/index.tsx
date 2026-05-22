import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { PartialRouterDemo } from './partial-router-demo';

export default component$(() => {
  return (
    <main>
      <h1>Partial navigation shell</h1>
      <PartialRouterDemo />
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Partial Navigation App',
};
