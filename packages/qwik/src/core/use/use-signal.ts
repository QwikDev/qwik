import { isQwikComponent } from '../component/component.public';
import { isFunction } from '../util/types';
import { createSignal, type Signal } from '../v2/signal/v2-signal.public';
import { invoke } from './use-core';
import { useSequentialScope } from './use-sequential-scope';

/** @public */
export interface UseSignal {
  <T>(): Signal<T | undefined>;
  <T>(value: T | (() => T)): Signal<T>;
}

/** @public */
export const useSignal: UseSignal = <STATE>(initialState?: STATE): Signal<STATE> => {
  return useConstant(() => {
    const value =
      isFunction(initialState) && !isQwikComponent(initialState)
        ? invoke(undefined, initialState as any)
        : initialState;
    return createSignal<STATE>(value);
  });
};

/**
 * Stores a value which is retained for the lifetime of the component. Subsequent calls to
 * `useConstant` will always return the first value given.
 *
 * If the value is a function, the function is invoked once to calculate the actual value.
 *
 * @public
 */
export const useConstant = <T>(value: (() => T) | T): T => {
  const { val, set } = useSequentialScope<T>();
  if (val != null) {
    return val;
  }
  // Note: We are not using `invoke` here because we don't want to clear the context
  value = isFunction(value) && !isQwikComponent(value) ? value() : value;
  return set(value as T);
};
