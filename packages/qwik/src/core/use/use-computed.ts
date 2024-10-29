import { assertQrl } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { ComputedSignal, throwIfQRLNotResolved } from '../signal/signal';
import type { ReadonlySignal, Signal } from '../signal/signal.public';
import { useSequentialScope } from './use-sequential-scope';

/** @public */
export type ComputedFn<T> = () => T;

/** @internal */
export const useComputedQrl = <T>(
  qrl: QRL<ComputedFn<T>>
): T extends Promise<any> ? never : ReadonlySignal<T> => {
  const { val, set } = useSequentialScope<Signal<T>>();
  if (val) {
    return val as any;
  }
  assertQrl(qrl);
  const signal = new ComputedSignal(null, qrl);
  set(signal);

  // Note that we first save the signal
  // and then we throw to load the qrl
  // This is why we can't use useConstant, we need to keep using the same qrl object
  throwIfQRLNotResolved(qrl);
  return signal as any;
};
