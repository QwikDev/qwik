import { $, component$, onRender$, useStore } from '@builder.io/qwik';

export const MyApp = component$(() => {
  const store1 = useStore({ count: 1 });
  const store2 = useStore({ count: 1 });
  return onRender$(() => (
    <button class="two-listeners" on:click={[$(() => store1.count++), $(() => store2.count++)]}>
      {store1.count} / {store2.count}
    </button>
  ));
});
