import { createProxy, QObjectRecursive } from '../object/q-object';
import { RenderInvokeContext, useInvokeContext } from './use-core';
import { getContext } from '../props/props';
import { isFunction } from '../util/types';

export interface UseStoreOptions {
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
 * ## Example
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
 *     <Host>
 *       <div>Counter: {counter.value}</div>
 *       <Child userData={userData} state={state} />
 *     </Host>
 *   );
 * });
 *
 * function useCounter(step: number) {
 *   // Multiple stores can be created in custom hooks for convenience and composability
 *   const counterStore = useStore({
 *     value: 0,
 *   });
 *   useClientEffect$(() => {
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
  const { get, set, ctx } = useSequentialScope<STATE>();
  if (get != null) {
    return get;
  }
  const containerState = ctx.$renderCtx$.$containerState$;
  const value = isFunction(initialState) ? (initialState as Function)() : initialState;
  const recursive = opts?.recursive ?? false;
  const flags = recursive ? QObjectRecursive : 0;
  const newStore = createProxy(value, containerState, flags, undefined);
  set(newStore);
  return newStore;
};

/**
 * @alpha
 */
export interface Ref<T> {
  current?: T;
}

// <docs markdown="../readme.md#useRef">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useRef instead)
/**
 * It's a very thin wrapper around `useStore()`, including the proper type signature to be passed
 * to the `ref` property in JSX.
 *
 * ```tsx
 * export function useRef<T = Element>(current?: T): Ref<T> {
 *   return useStore({ current });
 * }
 * ```
 *
 * ## Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const input = useRef<HTMLInputElement>();
 *
 *   useClientEffect$((track) => {
 *     const el = track(input, 'current')!;
 *     el.focus();
 *   });
 *
 *   return (
 *     <Host>
 *       <input type="text" ref={input} />
 *     </Host>
 *   );
 * });
 *
 * ```
 *
 * @public
 */
// </docs>
export const useRef = <T = Element>(current?: T): Ref<T> => {
  return useStore({ current });
};

export interface SequentialScope<T> {
  readonly get: T | undefined;
  readonly set: (v: T) => void;
  readonly i: number;
  readonly ctx: RenderInvokeContext;
}

/**
 * @alpha
 */
export const useSequentialScope = <T>(): SequentialScope<T> => {
  const ctx = useInvokeContext();
  const i = ctx.$seq$;
  const hostElement = ctx.$hostElement$;
  const elementCtx = getContext(hostElement);
  ctx.$seq$++;
  const set = (value: T) => {
    elementCtx.$seq$[i] = value;
  };
  return {
    get: elementCtx.$seq$[i],
    set,
    i,
    ctx,
  };
};
