import { $, component$, useSignal } from '@qwik.dev/core';
import { openFeature } from './heavy-feature';

export const App = component$(() => {
  const count = useSignal(0);
  const open$ = $(() => openFeature(count.value));
  return (
    <>
      <button onClick$={() => count.value++}>increment</button>
      <button onClick$={() => console.log('click')}>plain</button>
      <button onClick$={open$}>open</button>
    </>
  );
});
