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
