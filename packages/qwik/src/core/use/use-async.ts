import { createAsyncSignal } from '../reactive-primitives/signal-api';
import { type AsyncSignal } from '../reactive-primitives/signal.public';
import type { AsyncCtx, AsyncSignalOptions } from '../reactive-primitives/types';
import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { QRL } from '../shared/qrl/qrl.public';
import { useConstant } from './use-signal';

/** @public */
export type AsyncFn<T> = (ctx: AsyncCtx) => Promise<T>;

const creator = <T>(qrl: QRL<AsyncFn<T>>, options?: AsyncSignalOptions<T>) => {
  qrl.resolve();
  return createAsyncSignal(qrl, options);
};

/** @internal */
export const useAsyncQrl = <T>(
  qrl: QRL<AsyncFn<T>>,
  options?: AsyncSignalOptions<T>
): AsyncSignal<T> => {
  return useConstant(creator<T>, qrl, options);
};

/**
 * Creates an AsyncSignal which holds the result of the given async function. If the function uses
 * `track()` to track reactive state, and that state changes, the AsyncSignal is recalculated, and
 * if the result changed, all tasks which are tracking the AsyncSignal will be re-run and all
 * subscribers (components, tasks etc) that read the AsyncSignal will be updated.
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
