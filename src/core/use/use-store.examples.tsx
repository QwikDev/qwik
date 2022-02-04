//
// This file stores example snippets which are found in the docs.
//
// Edit the snippet here and verify that it compiles, than paste
// it to the desired comment location
//

import { component$, onRender$, createStore } from '@builder.io/qwik';

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////
// DOCS: component
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

//
// <docs anchor="createStore">
export const Counter = component$(() => {
  const store = createStore({ count: 0 });
  return onRender$(() => <button on$:click={() => store.count++}>{store.count}</button>);
});
// </docs>
//
