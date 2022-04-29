//
// This file stores example snippets which are found in the docs.
//
// Edit the snippet here and verify that it compiles, than paste
// it to the desired comment location
//

import { component$, useStore, useEffect$ } from '@builder.io/qwik';

// <docs anchor="useWatch">
export const MyComp = component$(() => {
  const store = useStore({ count: 0, doubleCount: 0 });
  useEffect$((track) => {
    const count = track(store, 'count');
    store.doubleCount = 2 * count;
  });
  return (
    <div>
      <span>
        {store.count} / {store.doubleCount}
      </span>
      <button onClick$={() => store.count++}>+</button>
    </div>
  );
});
// </docs>
