import { $, component$, event$, useSignal } from '@qwik.dev/core';
import { openFeature } from './heavy-feature';

export const App = component$(() => {
  const count = useSignal(0);
  const open$ = event$(() => openFeature(count.value));
  const read = $(() => count.value);
  read();
  return (
    <>
      <button onClick$={() => count.value++}>increment</button>
      <button onClick$={() => console.log('click')}>plain</button>
      <button onClick$={open$}>open</button>
    </>
  );
});
