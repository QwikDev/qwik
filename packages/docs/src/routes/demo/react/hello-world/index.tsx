import { component$ } from '@qwik.dev/core';
import { QGreetings } from './react';

export default component$(() => {
  return (
    <main>
      <p>Hello from Qwik</p>
      <QGreetings />
    </main>
  );
});
