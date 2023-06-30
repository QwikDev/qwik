import { component$, useSignal } from '@builder.io/qwik';
import { QButton, QDisplay } from './react';

export default component$(() => {
  console.log('Qwik Render');
  const count = useSignal(0);
  return (
    <main>
      <QButton
        onClick$={() => {
          console.log('click', count.value);
          count.value++;
        }}
      />
      <QDisplay count={count.value}></QDisplay>
    </main>
  );
});
