import { component$ } from '@builder.io/qwik';
import { QCounter } from './react';

export default component$(() => {
  console.log('Qwik Render');
  return (
    <div>
      <QCounter />
    </div>
  );
});
