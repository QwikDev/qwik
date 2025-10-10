import { component$, useSignal } from '@qwik.dev/core';
import { QButton, QDisplay } from './react';

export default component$(() => {
  console.log('Qwik Render');
  const count = useSignal(0);
  return (
    <main>
      <QButton
        host:onClick$={() => {
          console.log('click', count.value);
          count.value++;
        }}
      >
        +1
      </QButton>
      <QDisplay count={count.value}></QDisplay>
    </main>
  );
});
