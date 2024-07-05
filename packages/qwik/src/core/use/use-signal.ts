import { isQwikComponent } from '../component/component.public';
import { _createSignal, type Signal } from '../state/signal';
import { isFunction } from '../util/types';
import { createSignal2 } from '../v2/signal/v2-signal.public';
import { invoke } from './use-core';
import { useSequentialScope } from './use-sequential-scope';

/** @public */
export interface UseSignal {
  <T>(): Signal<T | undefined>;
  <T>(value: T | (() => T)): Signal<T>;
}

/** @public */
export const useSignal: UseSignal = <STATE>(initialState?: STATE): Signal<STATE> => {
  const { val, set } = useSequentialScope<Signal<STATE>>();
  if (val != null) {
    return val;
  }

  const value =
    isFunction(initialState) && !isQwikComponent(initialState)
      ? invoke(undefined, initialState as any)
      : initialState;
  const signal = createSignal2(value);
  return set(signal);
};
