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
/** @public */
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
  // Note: We are not using `invoke` here because we don't want to clear the context
  value = isFunction(value) && !isQwikComponent(value) ? untrack(value, ...args) : value;
  return set(value as T);
};
