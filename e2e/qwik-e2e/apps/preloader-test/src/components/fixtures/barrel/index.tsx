import { component$, useSignal } from '@qwik.dev/core';
import { Alpha } from './ui';

export default component$(() => {
  const isShown = useSignal(false);
  return (
    <section class="fixture" data-fixture="barrel/barrel">
      <h2>barrel</h2>
      <button data-testid="trigger" onClick$={() => (isShown.value = true)}>
        Show
      </button>
      {isShown.value && <Alpha />}
    </section>
  );
});
