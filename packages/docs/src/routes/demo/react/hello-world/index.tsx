import { component$ } from '@builder.io/qwik';
import { QGreetings } from './react';

export default component$(() => {
  return (
    <main>
      <p>Hello from Qwik</p>
      <QGreetings />
    </main>
  );
});
