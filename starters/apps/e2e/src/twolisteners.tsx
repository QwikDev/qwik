import { $, component$, useStore } from '@builder.io/qwik';

import './global.css';

export const TwoListeners = component$(() => {
  const store1 = useStore({ count: 1 });
  const store2 = useStore({ count: 1 });
  return $(() => (
    <button class="two-listeners" on:click={[$(() => store1.count++), $(() => store2.count++)]}>
      {store1.count} / {store2.count}
    </button>
  ));
});
