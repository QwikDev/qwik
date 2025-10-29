import { component$, useSignal, useTask$ } from '@qwik.dev/core';
import { userData } from './exported';

// C1: should warn (not first, no resolve)
export const C1 = component$(() => {
  const signal = useSignal(0);
  useTask$(() => {
    signal.value++;
    userData.value; // expect errorł
  });
  return null;
});

// C2: ok (first statement)
export const C2 = component$(() => {
  const signal = useSignal(0);
  useTask$(() => {
    userData.value; // ok
    signal.value++;
  });
  return null;
});

// C3: ok because awaited resolve earlier
export const C3 = component$(() => {
  const signal = useSignal(0);
  useTask$(async () => {
    await userData.resolve();
    signal.value++;
    userData.value; // ok
  });
  return null;
});
