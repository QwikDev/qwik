import { isQwikComponent } from '../shared/component.public';
import { isFunction } from '../shared/utils/types';
import { createSignal, type Signal } from '../reactive-primitives/signal.public';
import { invoke, untrack } from './use-core';
import { useSequentialScope } from './use-sequential-scope';

/** @public */
export interface UseSignal {
  <T>(): Signal<T | undefined>;
  <T>(value: T | (() => T)): Signal<T>;
}

const getSignal = <STATE>(initialState?: STATE) => {
  const value =
    isFunction(initialState) && !isQwikComponent(initialState)
      ? invoke(undefined, initialState as any)
      : initialState;
  return createSignal<STATE>(value);
};

// <docs markdown="../readme.md#useSignal">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useSignal instead and run `pnpm docs.sync`)
/**
 * Creates an object with a single reactive `.value` property, that Qwik can track across
 * serializations.
 *
 * Use it to create state for your application. The object has a getter and setter to track reads
 * and writes of the `.value` property. When the value changes, any functions that read from it will
 * re-run.
 *
 * Prefer `useSignal` over `useStore` when possible, as it is more efficient.
 *
 * ### Example
 *
 * ```tsx
 * const Signals = component$(() => {
 *   const counter = useSignal(1);
 *   const text = useSignal('changeme');
 *   const toggle = useSignal(false);
 *
 *   // useSignal() can also accept a function to calculate the initial value
 *   const state = useSignal(() => {
 *     return expensiveInitialValue();
 *   });
 *
 *   return (
 *     <div>
 *       <button onClick$={() => counter.value++}>Counter: {counter.value}</button>
 *       {
 *         // pass signal values as the value, the optimizer will make it pass the signal
 *       }
 *       <Child state={state.value} />
 *       {
 *         // signals can be bound to inputs. A property named `bind:x` implies that the property
 * is a signal
 *       }
 *       <input type="text" bind:value={text} />
 *       <input type="checkbox" bind:checked={toggle} />
 *     </div>
 *   );
 * });
 * ```
 *
 * @public
 */
// </docs>
export const useSignal: UseSignal = <STATE>(initialState?: STATE): Signal<STATE> => {
  return useConstant(getSignal<STATE>, initialState);
};

/**
 * Stores a value which is retained for the lifetime of the component. Subsequent calls to
 * `useConstant` will always return the first value given.
 *
 * If the value is a function, the function is invoked once to calculate the actual value. You can
 * then also pass arguments to call the function with, so that you don't need to create a new
 * function on every render.
 *
 * @example
 *
 * ```tsx
 * const fixedRandomValue = useConstant(() => Math.random);
 * const otherFixedRandomValue = useConstant(Math.random);
 *
 * const getConfig = (env: string) => { ... }
 * const config = useConstant(getConfig, environment);
 * ```
 *
 * @public
 */
export const useConstant = <T, A extends any[]>(value: ((...args: A) => T) | T, ...args: A): T => {
  const { val, set } = useSequentialScope<T>();
  if (val != null) {
    return val;
  }
  // We don't want to create a subscription since we only run this once
  // Note: We are not using `invoke` here because we don't want to clear the context
  value = isFunction(value) && !isQwikComponent(value) ? untrack(value, ...args) : value;
  return set(value as T);
};
