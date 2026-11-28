import { component$, useComputed$, useSignal } from '@qwik.dev/core';
import { CountLabel } from './count-label';
import { Peek } from './peek';
import { Writer } from './writer';

export default component$(() => {
  const count = useSignal(0);
  const items = useSignal([1, 2, 3]);
  const total = useComputed$(() => items.value.length, { serializationStrategy: 'never' });
  return (
    <section class="fixture" data-fixture="tasks/computed-from-parent">
      <h2>task reading a computed from another component</h2>
      <Writer count={count} />
      <Peek count={count} />
      <CountLabel count={count} total={total} />
    </section>
  );
});
