import { createAsyncComputedSignal } from '../reactive-primitives/signal-api';
import { type AsyncComputedReadonlySignal } from '../reactive-primitives/signal.public';
import type { AsyncComputedCtx, ComputedOptions } from '../reactive-primitives/types';
import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { QRL } from '../shared/qrl/qrl.public';
import { useComputedCommon } from './use-computed';

/** @public */
export type AsyncComputedFn<T> = (ctx: AsyncComputedCtx) => Promise<T>;
/** @public */
export type AsyncComputedReturnType<T> =
  T extends Promise<infer T> ? AsyncComputedReadonlySignal<T> : AsyncComputedReadonlySignal<T>;

/** @internal */
export const useAsyncComputedQrl = <T>(
  qrl: QRL<AsyncComputedFn<T>>,
  options?: ComputedOptions
): AsyncComputedReturnType<T> => {
  return useComputedCommon(qrl, createAsyncComputedSignal, options);
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
export const useAsyncComputed$ = implicit$FirstArg(useAsyncComputedQrl);
