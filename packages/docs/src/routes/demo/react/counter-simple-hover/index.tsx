import { component$ } from '@qwikdev/core';
import { QCounter } from './react';

export default component$(() => {
  console.log('Qwik Render');
  return (
    <main>
      <QCounter />
    </main>
  );
});
