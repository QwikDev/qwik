import { component$ } from '@builder.io/qwik';
import { QGreetings } from './react';

export default component$(() => {
  return (
    <div>
      <div>Hello from Qwik</div>
      <QGreetings />
    </div>
  );
});
