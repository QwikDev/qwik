import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { QRL } from '../shared/qrl/qrl.public';
import type { ComputedSignal } from '../reactive-primitives/signal.public';
import { createComputedSignal } from '../reactive-primitives/signal-api';
import type { ComputeCtx, ComputedOptions } from '../reactive-primitives/types';
import type { ValueOrPromise } from '../shared/utils/types';
import { useConstant } from './use-signal';

/**
 * The compute function. The context provides `track()`, `previous` (the last computed value),
 * `info` (the argument of the `invalidate(info)` call that triggered this computation), `cleanup()`
 * and `abortSignal`. Synchronous reactive state reads are tracked automatically, use `untrack()` to
 * read signals without tracking. Return a `Promise` (or use an `async` function) for async values.
 * After the first `await`, reads are no longer tracked automatically and must use `track()`.
 *
 * @public
 */
// ctx is not `ComputeCtx<T>`: putting T in a parameter position breaks return-type inference, so
// `ctx.previous` is `unknown` and must be cast if its type is needed.
export type ComputedFn<T> = (ctx: ComputeCtx) => ValueOrPromise<T>;
/** @public */
export type ComputedReturnType<T> = ComputedSignal<Awaited<T>>;

const creator = <T>(qrl: QRL<ComputedFn<T>>, options?: ComputedOptions<T>) => {
  qrl.resolve();
  return createComputedSignal<T>(qrl, options);
};
/** @internal */
export const useComputedQrl = <T>(
  qrl: QRL<ComputedFn<T>>,
  options?: ComputedOptions<T>
): ComputedReturnType<T> => {
  return useConstant(creator<T>, qrl, options) as any;
};

/**
 * Creates a computed signal which is calculated from the given function. A computed signal is a
 * signal which is calculated from other signals. When the signals change, the computed signal is
 * recalculated, and if the result changed, all tasks which are tracking the signal will be re-run
 * and all components that read the signal will be re-rendered.
 *
 * Every synchronous signal or store read is tracked automatically. Reads after an `await` are not:
 * the tracking context is lost, so track them explicitly with the `track()` provided on the context
 * argument. When the function is async, the returned signal exposes the async API: reading an
 * unresolved `.value` throws the computation promise, and `.pending` and `.error` expose the
 * computation state.
 *
 * The function must not have any side effects.
 *
 * @public
 */
export const useComputed$ = implicit$FirstArg(useComputedQrl);
