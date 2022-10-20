import { createSignal, Signal } from '../state/signal';
import { useSequentialScope } from './use-sequential-scope';

/**
 * @alpha
 */
export interface UseSignal {
  <T>(): Signal<T | undefined>;
  <T>(value: T): Signal<T>;
}

/**
 * @alpha
 */
export const useSignal: UseSignal = <STATE>(initialState?: STATE): Signal<STATE> => {
  const { get, set, ctx } = useSequentialScope<Signal<STATE>>();
  if (get != null) {
    return get;
  }

  const containerState = ctx.$renderCtx$.$static$.$containerState$;
  const signal = createSignal(initialState, containerState, undefined) as Signal<STATE>;
  set(signal);
  return signal;
};
