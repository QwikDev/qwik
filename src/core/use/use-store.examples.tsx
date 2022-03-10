//
// This file stores example snippets which are found in the docs.
//
// Edit the snippet here and verify that it compiles, than paste
// it to the desired comment location
//

import { component$, $, useStore } from '@builder.io/qwik';

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////
// DOCS: component
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

//
// <docs anchor="useStore">
export const Counter = component$(() => {
  const store = useStore({ count: 0 });
  return $(() => <button on$:click={() => store.count++}>{store.count}</button>);
});
// </docs>
//
