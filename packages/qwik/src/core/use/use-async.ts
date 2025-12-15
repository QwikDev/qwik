import { createAsyncSignal } from '../reactive-primitives/signal-api';
import { type AsyncSignal } from '../reactive-primitives/signal.public';
import type { AsyncCtx, ComputedOptions } from '../reactive-primitives/types';
import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { QRL } from '../shared/qrl/qrl.public';
import { useComputedCommon } from './use-computed';

/** @public */
export type AsyncFn<T> = (ctx: AsyncCtx) => Promise<T>;
/** @public */
export type AsyncReturnType<T> = T extends Promise<infer T> ? AsyncSignal<T> : AsyncSignal<T>;

/** @internal */
export const useAsyncQrl = <T>(
  qrl: QRL<AsyncFn<T>>,
  options?: ComputedOptions
): AsyncReturnType<T> => {
  return useComputedCommon(qrl, createAsyncSignal, options);
};

/**
 * Creates an AsyncSignal which is calculated from the given async function. If the function uses
 * reactive state, and that state changes, the AsyncSignal is recalculated, and if the result
 * changed, all tasks which are tracking the AsyncSignal will be re-run and all components that read
 * the AsyncSignal will be re-rendered.
 *
 * The function must not have any side effects, as it can run multiple times.
 *
 * If the async function throws an error, the AsyncSignal will capture the error and set the `error`
 * property. The error can be cleared by re-running the async function successfully.
 *
 * While the async function is running, the `loading` property will be set to `true`. Once the
 * function completes, `loading` will be set to `false`.
 *
 * If the value has not yet been resolved, reading the AsyncSignal will throw a Promise, which will
 * retry the component or task once the value resolves.
 *
 * If the value has been resolved, but the async function is re-running, reading the AsyncSignal
 * will subscribe to it and return the last resolved value until the new value is ready. As soon as
 * the new value is ready, the subscribers will be updated.
 *
 * @public
 */
export const useAsync$ = implicit$FirstArg(useAsyncQrl);
