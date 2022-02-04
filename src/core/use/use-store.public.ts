import { qObject } from '../object/q-object';

// <docs markdown="https://hackmd.io/lQ8v7fyhR-WD3b-2aRUpyw#createStore">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit https://hackmd.io/lQ8v7fyhR-WD3b-2aRUpyw#createStore instead)
/**
 * Creates a object that Qwik can track across serializations.
 *
 * Use `createStore` to create state for your application. The return object is a proxy which has a
 * unique ID. The ID of the object is used is the `QRL`s to refer to the store.
 *
 * ## Example
 *
 * Example showing how `createStore` is used in Counter example to keep track of count.
 *
 * ```typescript
 * export const Counter = component$(() => {
 *   const store = createStore({ count: 0 });
 *   return onRender$(() => <button on$:click={() => store.count++}>{store.count}</button>);
 * });
 * ```
 *
 * @public
 */
// </docs>
export function createStore<STATE extends {}>(initialState: STATE): STATE {
  return qObject(initialState);
}
