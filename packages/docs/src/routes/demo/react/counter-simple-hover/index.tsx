import { component$ } from '@qwik.dev/core';
import { QCounter } from './react';

export default component$(() => {
  console.log('Qwik Render');
  return (
    <main>
      <QCounter />
    </main>
  );
});
