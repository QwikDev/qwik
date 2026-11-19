import { component$, useSignal } from '@qwik.dev/core';

export const OffScreenButton = component$(() => {
  const count = useSignal(0);
  return (
    <section class="fixture" data-fixture="speculative/off-screen">
      <h2>button off screen</h2>
      <button onClick$={() => count.value++}>Off screen</button>
      <span>{count.value}</span>
    </section>
  );
});
