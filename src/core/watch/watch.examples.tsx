//
// This file stores example snippets which are found in the docs.
//
// Edit the snippet here and verify that it compiles, than paste
// it to the desired comment location
//

import { component$, useStore, $, onWatch$ } from '@builder.io/qwik';

// <docs anchor="onWatch">
export const MyComp = component$(() => {
  const store = useStore({ count: 0, doubleCount: 0 });
  onWatch$((obs) => {
    store.doubleCount = 2 * obs(store).count;
  });
  return $(() => (
    <div>
      <span>
        {store.count} / {store.doubleCount}
      </span>
      <button on$:click={() => store.count++}>+</button>
    </div>
  ));
});
// </docs>
