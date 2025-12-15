import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import { assertQrl } from '../shared/qrl/qrl-utils';
import type { QRL } from '../shared/qrl/qrl.public';
import { ComputedSignalImpl } from '../reactive-primitives/impl/computed-signal-impl';
import { throwIfQRLNotResolved } from '../reactive-primitives/utils';
import type { ComputedSignal, Signal } from '../reactive-primitives/signal.public';
import { useSequentialScope } from './use-sequential-scope';
import { createComputedSignal } from '../reactive-primitives/signal-api';
import type { AsyncSignalImpl } from '../reactive-primitives/impl/async-signal-impl';
import type { SerializerSignalImpl } from '../reactive-primitives/impl/serializer-signal-impl';
import type { ComputedOptions } from '../reactive-primitives/types';

/** @public */
export type ComputedFn<T> = () => T;
/** @public */
export type ComputedReturnType<T> = T extends Promise<any> ? never : ComputedSignal<T>;

export const useComputedCommon = <
  T,
  S,
  FUNC extends Function = ComputedFn<T>,
  RETURN = ComputedReturnType<T>,
>(
  qrl: QRL<FUNC>,
  createFn: (
    qrl: QRL<any>,
    options?: ComputedOptions
  ) => ComputedSignalImpl<T> | AsyncSignalImpl<T> | SerializerSignalImpl<T, S>,
  options?: ComputedOptions
): RETURN => {
  const { val, set } = useSequentialScope<Signal<T>>();
  if (val) {
    return val as any;
  }
  assertQrl(qrl);
  const signal = createFn(qrl, options);
  set(signal);

  // Note that we first save the signal
  // and then we throw to load the qrl
  // This is why we can't use useConstant, we need to keep using the same qrl object
  throwIfQRLNotResolved(qrl);
  return signal as any;
};

/** @internal */
export const useComputedQrl = <T>(
  qrl: QRL<ComputedFn<T>>,
  options?: ComputedOptions
): ComputedReturnType<T> => {
  return useComputedCommon(qrl, createComputedSignal, options);
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
