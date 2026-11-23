import { component$, useComputed$, useContextProvider, useSignal } from '@qwik.dev/core';
import { TotalContext } from './context';
import { CountLabel } from './count-label';
import { Writer } from './writer';

export default component$(() => {
  const count = useSignal(0);
  const items = useSignal([1, 2, 3]);
  const total = useComputed$(() => items.value.length, { serializationStrategy: 'never' });
  useContextProvider(TotalContext, { total });
  return (
    <section class="fixture" data-fixture="tasks/callback-reading-a-computed">
      <h2>callback reading a computed that a task in the chain also reads</h2>
      <Writer count={count} />
      <CountLabel count={count} />
    </section>
  );
});
