import { component$ } from '@qwik.dev/core';
import { QCounter } from './react';

export default component$(() => {
  return (
    <main>
      <QCounter />
    </main>
  );
});
