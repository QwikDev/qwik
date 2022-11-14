import { createSignal, Signal } from '../state/signal';
import { isFunction } from '../util/types';
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
  const value = isFunction(initialState) ? (initialState as Function)() : initialState;
  const signal = createSignal(value, containerState, undefined) as Signal<STATE>;
  set(signal);
  return signal;
};
