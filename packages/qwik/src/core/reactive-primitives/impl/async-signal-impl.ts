import type { Container } from '../../shared/types';
import {
  AsyncQRL,
  AsyncSignalFlags,
  ComputedSignalFlags,
  SerializationSignalFlags,
  type AsyncSignalOptions,
} from '../types';
import type { AsyncSignal, ComputedSignal } from '../signal.public';
import { ComputedSignalImpl } from './computed-signal-impl';

/**
 * # ================================
 *
 * AsyncSignalImpl
 *
 * # ================================
 *
 * The async engine (jobs, loading, error, polling) lives in ComputedSignalImpl; this subclass
 * configures it from options and switches the compute invocation to CTX_ARG mode: the compute fn
 * receives the ComputeCtx argument and tracks only via its explicit `track()` (no auto-tracking).
 *
 * @internal
 */
export class AsyncSignalImpl<T>
  extends ComputedSignalImpl<T, AsyncQRL<T>>
  implements AsyncSignal<T>
{
  constructor(
    container: Container | null,
    fn: AsyncQRL<T>,
    flags: number = ComputedSignalFlags.INVALID |
      SerializationSignalFlags.SERIALIZATION_STRATEGY_ALWAYS,
    options?: AsyncSignalOptions<T>
  ) {
    super(container, fn, flags | AsyncSignalFlags.ASYNC_MODE | AsyncSignalFlags.CTX_ARG, options);
  }
}

/**
 * Inject a pre-loaded value into a signal while preserving subscriptions. Calls `invalidate({__v})`
 * so the compute function reads the value from `info`, then triggers an immediate synchronous
 * compute via the private `$computeIfNeeded$()` method (which is mangled in core builds, so callers
 * from other packages must go through this helper).
 *
 * @internal
 */
export const _injectAsyncSignalValue = (signal: ComputedSignal<unknown>, value: unknown) => {
  const impl = signal as AsyncSignalImpl<unknown>;
  impl.invalidate({ __v: value });
  impl.$computeIfNeeded$();
};
