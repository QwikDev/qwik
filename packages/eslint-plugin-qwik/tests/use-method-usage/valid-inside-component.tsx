import { component$, useSignal, useTask$ } from '@qwik.dev/core';
import { isServer } from '@qwik.dev/core/build';

export const InsideTask = component$(() => {
  const mySig = useSignal(0);
  useTask$(async function initTask() {
    if (isServer) {
      await fetch('/url');
    }
  });

  useTask$(({ track }) => {
    track(() => mySig.value);
  });
  return <div></div>;
});
