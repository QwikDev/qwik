import { _createSignal, Signal } from '../state/signal';
import { isFunction } from '../util/types';
import { invoke } from './use-core';
import { useSequentialScope } from './use-sequential-scope';

/**
 * @alpha
 */
export interface UseSignal {
  <T>(): Signal<T | undefined>;
  <T>(value: T | (() => T)): Signal<T>;
}

/**
 * @alpha
 */
export const useSignal: UseSignal = <STATE>(initialState?: STATE): Signal<STATE> => {
  const { get, set, iCtx } = useSequentialScope<Signal<STATE>>();
  if (get != null) {
    return get;
  }

  const containerState = iCtx.$renderCtx$.$static$.$containerState$;
  const value = isFunction(initialState) ? invoke(undefined, initialState as any) : initialState;
  const signal = _createSignal(value, containerState, undefined) as Signal<STATE>;
  set(signal);
  return signal;
};
