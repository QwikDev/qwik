import { component$, useComputed$, useSignal, useStore } from '@qwik.dev/core';
import { CountLabel } from './count-label';
import { Writer } from './writer';

export default component$(() => {
  const count = useSignal(0);
  const items = useSignal([1, 2, 3]);
  const total = useComputed$(() => items.value.length, { serializationStrategy: 'never' });
  const state = useStore({ stats: { total } });
  return (
    <section class="fixture" data-fixture="tasks/computed-inside-store">
      <h2>task reading a computed inside a store</h2>
      <Writer count={count} />
      <CountLabel count={count} state={state} />
    </section>
  );
});
