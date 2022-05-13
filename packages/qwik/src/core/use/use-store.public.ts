import { useDocument } from '../use/use-document.public';
import { getProxyMap, qObject } from '../object/q-object';
import { getInvokeContext } from './use-core';
import { useHostElement } from './use-host-element.public';
import { getContext } from '../props/props';
import { wrapSubscriber } from './use-subscriber';
import { assertEqual } from '../assert/assert';
import { RenderEvent } from '../util/markers';

// <docs markdown="../readme.md#useStore">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useStore instead)
/**
 * Creates a object that Qwik can track across serializations.
 *
 * Use `useStore` to create state for your application. The return object is a proxy which has a
 * unique ID. The ID of the object is used in the `QRL`s to refer to the store.
 *
 * ## Example
 *
 * Example showing how `useStore` is used in Counter example to keep track of count.
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
export function useStore<STATE extends object>(initialState: STATE | (() => STATE)): STATE {
  const [store, setStore] = useSequentialScope();
  const hostElement = useHostElement();
  if (store != null) {
    return wrapSubscriber(store, hostElement);
  }
  const value = typeof initialState === 'function' ? (initialState as Function)() : initialState;
  const newStore = qObject(value, getProxyMap(useDocument()));
  setStore(newStore);
  return wrapSubscriber(newStore, hostElement);
}

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
 * It's a very thin wrapper around `useStore()` including the proper type signature to be passed
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
export function useRef<T = Element>(current?: T): Ref<T> {
  return useStore({ current });
}

export function useSequentialScope(): [any, (prop: any) => void] {
  const ctx = getInvokeContext();
  assertEqual(ctx.event, RenderEvent);
  const index = ctx.seq;
  const hostElement = useHostElement();
  const elementCtx = getContext(hostElement);
  ctx.seq++;
  const updateFn = (value: any) => {
    elementCtx.seq[index] = elementCtx.refMap.add(value);
  };
  const seqIndex = elementCtx.seq[index];
  if (typeof seqIndex === 'number') {
    return [elementCtx.refMap.get(seqIndex), updateFn];
  }
  return [undefined, updateFn];
}
