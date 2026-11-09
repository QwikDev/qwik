import { component$, useSignal } from '@qwik.dev/core';
import { heavyPayload } from './heavy-payload';

export const Heavy = component$(() => {
  const length = useSignal(0);
  return (
    <section class="fixture" data-fixture="speculative/heavy">
      <h2>heavy chunk (~60 kB)</h2>
      <button onClick$={() => (length.value = heavyPayload.length)}>Load heavy</button>
      <span>{length.value}</span>
    </section>
  );
});
