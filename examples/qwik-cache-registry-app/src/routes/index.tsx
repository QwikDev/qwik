import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { ProductList } from './product-list';

export default component$(() => {
  return (
    <main>
      <h1>Qwik Cache Registry App</h1>
      <ProductList ids={['keyboard', 'mouse', 'keyboard']} />
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Cache Registry App',
};
