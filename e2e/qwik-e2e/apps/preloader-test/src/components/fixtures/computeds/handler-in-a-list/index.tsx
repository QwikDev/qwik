import { component$, useComputed$, useSignal } from '@qwik.dev/core';
import { List } from './list';

export default component$(() => {
  const items = useSignal([1, 2, 3]);
  const total = useComputed$(() => items.value.length, { serializationStrategy: 'never' });
  return (
    <section class="fixture" data-fixture="computeds/handler-in-a-list">
      <h2>a click handler reading a computed from another component</h2>
      <List rows={[{ label: 'Read the total', total }]} />
    </section>
  );
});
