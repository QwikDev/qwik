import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { QRL } from '../shared/qrl/qrl.public';
import type { ComputedSignal } from '../reactive-primitives/signal.public';
import { createComputedSignal } from '../reactive-primitives/signal-api';
import type { ComputedOptions } from '../reactive-primitives/types';
import { useConstant } from './use-signal';

/** @public */
export type ComputedFn<T> = () => T;
/** @public */
export type ComputedReturnType<T> = T extends Promise<any> ? never : ComputedSignal<T>;

const creator = <T>(qrl: QRL<ComputedFn<T>>, options?: ComputedOptions) => {
  qrl.resolve();
  return createComputedSignal(qrl, options);
};
/** @internal */
export const useComputedQrl = <T>(
  qrl: QRL<ComputedFn<T>>,
  options?: ComputedOptions
): ComputedReturnType<T> => {
  return useConstant(creator<T>, qrl, options) as any;
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
