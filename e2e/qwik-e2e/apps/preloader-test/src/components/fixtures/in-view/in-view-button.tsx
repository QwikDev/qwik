import { component$, useSignal } from '@qwik.dev/core';

export const InViewButton = component$(() => {
  const count = useSignal(0);
  return (
    <section class="fixture" data-fixture="speculative/in-view">
      <h2>button in view</h2>
      <button onClick$={() => count.value++}>In view</button>
      <span>{count.value}</span>
    </section>
  );
});
