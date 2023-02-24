import { QObjectRecursive } from '../state/constants';
import { getOrCreateProxy } from '../state/store';
import { DeepReadonly, isFunction } from '../util/types';
import { invoke } from './use-core';
import { useSequentialScope } from './use-sequential-scope';

// Only the top-level fields are mutable for non-deep stores
type ShallowStore<STATE extends object> = { [K in keyof STATE]: DeepReadonly<STATE[K]> };

type StateInit<STATE extends object> = STATE | (() => STATE);

type UseStore = {
  <STATE extends object>(
    init: StateInit<STATE>,
    opts: UseStoreOptions & { reactive: false } // TODO: Do we like this?
  ): STATE;
  <STATE extends object>(init: StateInit<STATE>, opts: UseStoreOptions & { deep: true }): STATE;
  <STATE extends object>(
    init: StateInit<STATE>,
    opts: UseStoreOptions & { deep: false }
  ): ShallowStore<STATE>;
  <STATE extends object>(
    init: StateInit<STATE>,
    opts: Omit<UseStoreOptions, 'deep'> & { deep?: undefined; recursive: true }
  ): STATE;
  <STATE extends object>(init: StateInit<STATE>, opts?: UseStoreOptions): ShallowStore<STATE>;
};

/**
 * @public
 */
export interface UseStoreOptions {
  /**
   * If `true` then all nested objects and arrays will be tracked as well.
   * Default is `false`.
   */
  deep?: boolean;

  /**
   * If `false` then the object will not be tracked for changes.
   * Default is `true`.
   */
  reactive?: boolean;

  /**
   * @deprecated - use `deep` instead
   */
  recursive?: boolean;
}

// <docs markdown="../readme.md#useStore">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useStore instead)
/**
 * Creates an object that Qwik can track across serializations.
 *
 * Use `useStore` to create a state for your application. The returned object is a proxy that has
 * a unique ID. The ID of the object is used in the `QRL`s to refer to the store.
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
 *   useBrowserVisibleTask$(() => {
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
export const useStore: UseStore = <STATE extends object>(
  initialState: STATE | (() => STATE),
  opts?: UseStoreOptions
): STATE => {
  const { get, set, iCtx } = useSequentialScope<STATE>();
  if (get != null) {
    return get;
  }
  const value = isFunction(initialState) ? invoke(undefined, initialState) : initialState;
  if (opts?.reactive === false) {
    set(value);
    return value;
  } else {
    const containerState = iCtx.$renderCtx$.$static$.$containerState$;
    const recursive = opts?.deep ?? opts?.recursive ?? false;
    const flags = recursive ? QObjectRecursive : 0;
    const newStore = getOrCreateProxy(value, containerState, flags);
    set(newStore);
    return newStore;
  }
};
