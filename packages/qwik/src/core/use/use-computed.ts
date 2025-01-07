import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import { assertQrl } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { ComputedSignal, throwIfQRLNotResolved } from '../signal/signal';
import type { ReadonlySignal, Signal } from '../signal/signal.public';
import { useSequentialScope } from './use-sequential-scope';

/** @public */
export type ComputedFn<T> = () => T;

export const useComputedCommon = <T>(
  qrl: QRL<ComputedFn<T>>,
  Class: typeof ComputedSignal
): T extends Promise<any> ? never : ReadonlySignal<T> => {
  const { val, set } = useSequentialScope<Signal<T>>();
  if (val) {
    return val as any;
  }
  assertQrl(qrl);
  const signal = new Class(null, qrl);
  set(signal);

  // Note that we first save the signal
  // and then we throw to load the qrl
  // This is why we can't use useConstant, we need to keep using the same qrl object
  throwIfQRLNotResolved(qrl);
  return signal as any;
};

/** @internal */
export const useComputedQrl = <T>(
  qrl: QRL<ComputedFn<T>>
): T extends Promise<any> ? never : ReadonlySignal<T> => {
  return useComputedCommon(qrl, ComputedSignal);
};

/**
 * Creates a computed signal which is calculated from the given function. A computed signal is a
 * signal which is calculated from other signals. When the signals change, the computed signal is
 * recalculated, and if the result changed, all tasks which are tracking the signal will be re-run
 * and all components that read the signal will be re-rendered.
 *
 * The function must be synchronous and must not have any side effects.
 *
 * @public
 */
export const useComputed$ = implicit$FirstArg(useComputedQrl);
