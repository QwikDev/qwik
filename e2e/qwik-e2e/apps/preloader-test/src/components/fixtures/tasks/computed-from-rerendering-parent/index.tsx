import { component$, useComputed$, useSignal } from '@qwik.dev/core';
import { CountLabel } from './count-label';
import { Writer } from './writer';

export default component$(() => {
  const count = useSignal(0);
  const items = useSignal([1, 2, 3]);
  const total = useComputed$(() => items.value.length, { serializationStrategy: 'never' });
  const heading = count.value ? 'counted' : 'not counted yet';
  return (
    <section class="fixture" data-fixture="tasks/computed-from-rerendering-parent">
      <h2>{heading}</h2>
      <Writer count={count} />
      <CountLabel count={count} total={total} />
    </section>
  );
});
