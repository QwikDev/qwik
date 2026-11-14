import { component$, useSignal } from '@qwik.dev/core';
import { ListItem } from './list-item';

export default component$(() => {
  const items = useSignal<number[]>([]);
  return (
    <section class="fixture" data-fixture="empty-list">
      <h2>list the server rendered empty</h2>
      <button
        data-testid="trigger"
        onClick$={() => (items.value = [...items.value, items.value.length + 1])}
      >
        Add
      </button>
      <ul>
        {items.value.map((item) => (
          <ListItem key={item} item={item} />
        ))}
      </ul>
    </section>
  );
});
