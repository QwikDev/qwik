import { isQwikComponent } from '../component/component.public';
import { isFunction } from '../util/types';
import { createSignal2, type Signal2 } from '../v2/signal/v2-signal.public';
import { invoke } from './use-core';
import { useSequentialScope } from './use-sequential-scope';

/** @public */
export interface UseSignal {
  <T>(): Signal2<T | undefined>;
  <T>(value: T | (() => T)): Signal2<T>;
}

/** @public */
export const useSignal: UseSignal = <STATE>(initialState?: STATE): Signal2<STATE> => {
  const { val, set } = useSequentialScope<Signal2<STATE>>();
  if (val != null) {
    return val;
  }

  const value =
    isFunction(initialState) && !isQwikComponent(initialState)
      ? invoke(undefined, initialState as any)
      : initialState;
  const signal = createSignal2<STATE>(value);
  return set(signal);
};

/**
 * Stores a value which is retained for the lifetime of the component.
 *
 * If the value is a function, the function is invoked to calculate the actual value.
 *
 * @deprecated This is a technology preview
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
