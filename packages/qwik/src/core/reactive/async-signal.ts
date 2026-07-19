import type { ContainerContext } from '../runtime/container-context';
import type { QRL } from '../shared/qrl/qrl.public';
import { Computed, type ComputeSignalFn, type ComputeSignalQrl } from './computed';
import type { AsyncSignalOptions } from './public-types';

/** @deprecated Use `ComputeSignalFn` instead. */
export type AsyncSignalFn<T> = ComputeSignalFn<T>;
/** @deprecated Use `ComputeSignalQrl` instead. */
export type AsyncSignalQrl<T> = QRL<AsyncSignalFn<T>>;

/** @deprecated Use `Computed` instead. */
export class AsyncSignal<T> extends Computed<T> {
  constructor(
    computeQrl: AsyncSignalQrl<T> | null,
    computeFn: AsyncSignalFn<T> | null = null,
    container?: ContainerContext,
    options?: AsyncSignalOptions<T>
  ) {
    super(computeQrl as ComputeSignalQrl<T> | null, computeFn, container, options);
  }
}
