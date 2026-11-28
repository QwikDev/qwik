import { component$, useComputed$, useContextProvider, useSignal } from '@qwik.dev/core';
import { CounterContext } from './context';
import { CountLabel } from './count-label';
import { Writer } from './writer';

export default component$(() => {
  const count = useSignal(0);
  const items = useSignal([1, 2, 3]);
  const total = useComputed$(() => items.value.length, { serializationStrategy: 'never' });
  useContextProvider(CounterContext, { count, total });
  return (
    <section class="fixture" data-fixture="tasks/computed-from-context">
      <h2>task reading a computed from context</h2>
      <Writer />
      <CountLabel />
    </section>
  );
});
