import { useDocument } from '../use/use-document.public';
import { getProxyMap, qObject } from '../object/q-object';
import { getInvokeContext } from './use-core';
import { useHostElement } from './use-host-element.public';
import { getContext } from '../props/props';
import { wrapSubscriber } from './use-subscriber';
import { assertEqual } from '../assert/assert';
import { RenderEvent } from '../util/markers';

// <docs markdown="https://hackmd.io/lQ8v7fyhR-WD3b-2aRUpyw#useStore">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2FlQ8v7fyhR-WD3b-2aRUpyw%3Fboth#useStore instead)
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
 * ```typescript
 * export const Counter = component$(() => {
 *   const store = useStore({ count: 0 });
 *   return $(() => <button onClick$={() => store.count++}>{store.count}</button>);
 * });
 * ```
 *
 * @public
 */
// </docs>
export function useStore<STATE extends {}>(initialState: STATE): STATE {
  const [store, setStore] = useSequentialScope();
  const hostElement = useHostElement();
  if (store != null) {
    return wrapSubscriber(store, hostElement);
  }
  const newStore = qObject(initialState, getProxyMap(useDocument()));
  setStore(newStore);
  return wrapSubscriber(newStore, hostElement);
}

/**
 * @alpha
 */
export interface Ref<T> {
  current?: T;
}

/**
 * @alpha
 */
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
