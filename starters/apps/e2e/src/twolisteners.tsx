import { $, component$, createStore } from '@builder.io/qwik';

import './global.css';

export const TwoListeners = component$(() => {
  const store1 = createStore({ count: 1 });
  const store2 = createStore({ count: 1 });
  return $(() => (
    <button class="two-listeners" on:click={[$(() => store1.count++), $(() => store2.count++)]}>
      {store1.count} / {store2.count}
    </button>
  ));
});
