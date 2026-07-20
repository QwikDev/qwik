import { isQwikComponent } from '../component/component.public';
import { _createSignal, type Signal } from '../state/signal';
import { isFunction } from '../util/types';
import { invoke, useContainerState } from './use-core';
import { useSequentialScope } from './use-sequential-scope';

/** @public */
export interface UseSignal {
  <T>(): Signal<T | undefined>;
  <T>(value: T | (() => T)): Signal<T>;
}

/**
 * Creates a signal.
 *
 * If the initial state is a function, the function is invoked to calculate the actual initial
 * state.
 *
 * @deprecated This is a technology preview
 * @public
 */
export const createSignal: UseSignal = <STATE>(initialState?: STATE): Signal<STATE> => {
  const containerState = useContainerState();
  const value =
    isFunction(initialState) && !isQwikComponent(initialState)
      ? invoke(undefined, initialState as any)
      : initialState;
  return _createSignal(value, containerState, 0) as Signal<STATE>;
};

/**
 * Stores a value which is retained for the lifetime of the component.
 *
 * If the value is a function, the function is invoked to calculate the actual value.
 *
 * A factory that returns `undefined` is re-run on every render; any defined value (including
 * `null`) is retained and returned on subsequent renders.
 *
 * @deprecated This is a technology preview
 * @public
 */
export const useConstant = <T>(value: (() => T) | T): T => {
  const { val, set } = useSequentialScope<T>();
  // The stored value is `undefined` until the factory has produced a value, so only an
  // `undefined` result re-runs the factory; a `null` result is retained.
  if (val !== undefined) {
    return val;
  }
  // Note: We are not using `invoke` here because we don't want to clear the context
  value = isFunction(value) && !isQwikComponent(value) ? value() : value;
  return set(value as T);
};

/**
 * Hook that creates a signal that is retained for the lifetime of the component.
 *
 * @public
 */
export const useSignal: UseSignal = (initialState?: any) => {
  return useConstant(() => createSignal(initialState));
};
