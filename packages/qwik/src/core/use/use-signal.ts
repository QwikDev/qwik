import { isQwikComponent } from '../component/component.public';
import { _createSignal, type Signal } from '../state/signal';
import { isFunction } from '../util/types';
import { invoke } from './use-core';
import { useSequentialScope } from './use-sequential-scope';

/** @public */
export interface UseSignal {
  <T>(): Signal<T | undefined>;
  <T>(value: T | (() => T)): Signal<T>;
}

/** @public */
export const useSignal: UseSignal = <STATE>(initialState?: STATE): Signal<STATE> => {
  const { val, set, iCtx } = useSequentialScope<Signal<STATE>>();
  if (val != null) {
    return val;
  }

  const subsManager =
    iCtx.$container2$?.$subsManager$ || iCtx.$renderCtx$.$static$.$containerState$.$subsManager$;
  const value =
    isFunction(initialState) && !isQwikComponent(initialState)
      ? invoke(undefined, initialState as any)
      : initialState;
  const signal = _createSignal(value, subsManager, 0, undefined) as Signal<STATE>;
  return set(signal);
};
