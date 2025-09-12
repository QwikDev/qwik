import { isFunction } from '../shared/utils/types';
import { getOrCreateStore } from '../reactive-primitives/impl/store';
import { StoreFlags } from '../reactive-primitives/types';
import { invoke } from './use-core';
import { useSequentialScope } from './use-sequential-scope';

export { unwrapStore, forceStoreEffects } from '../reactive-primitives/impl/store';

/** @public */
export interface UseStoreOptions {
  /** If `true` then all nested objects and arrays will be tracked as well. Default is `true`. */
  deep?: boolean;

  /** If `false` then the object will not be tracked for changes. Default is `true`. */
  reactive?: boolean;
}

// <docs markdown="../readme.md#useStore">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useStore instead and run `pnpm docs.sync`)
/**
 * Creates an object that Qwik can track across serializations.
 *
 * Use `useStore` to create a state for your application. The returned object is a proxy that has a
 * unique ID. The ID of the object is used in the `QRL`s to refer to the store.
 *
 * ### Example
 *
 * Example showing how `useStore` is used in Counter example to keep track of the count.
 *
 * ```tsx
 * const Stores = component$(() => {
 *   const counter = useCounter(1);
 *
 *   // Reactivity happens even for nested objects and arrays
 *   const userData = useStore({
 *     name: 'Manu',
 *     address: {
 *       address: '',
 *       city: '',
 *     },
 *     orgs: [],
 *   });
 *
 *   // useStore() can also accept a function to calculate the initial value
 *   const state = useStore(() => {
 *     return {
 *       value: expensiveInitialValue(),
 *     };
 *   });
 *
 *   return (
 *     <div>
 *       <div>Counter: {counter.value}</div>
 *       <Child userData={userData} state={state} />
 *     </div>
 *   );
 * });
 *
 * function useCounter(step: number) {
 *   // Multiple stores can be created in custom hooks for convenience and composability
 *   const counterStore = useStore({
 *     value: 0,
 *   });
 *   useVisibleTask$(() => {
 *     // Only runs in the client
 *     const timer = setInterval(() => {
 *       counterStore.value += step;
 *     }, 500);
 *     return () => {
 *       clearInterval(timer);
 *     };
 *   });
 *   return counterStore;
 * }
 * ```
 *
 * @public
 */
// </docs>
export const useStore = <STATE extends object>(
  initialState: STATE | (() => STATE),
  opts?: UseStoreOptions
): STATE => {
  const { val, set, iCtx } = useSequentialScope<STATE>();
  if (val != null) {
    return val;
  }
  const value = isFunction(initialState) ? invoke(undefined, initialState) : initialState;
  if (opts?.reactive === false) {
    set(value);
    return value;
  } else {
    const containerState = iCtx.$container$;
    const recursive = opts?.deep ?? true;
    const flags = recursive ? StoreFlags.RECURSIVE : StoreFlags.NONE;
    const newStore = getOrCreateStore(value, flags, containerState);
    set(newStore);
    return newStore;
  }
};
