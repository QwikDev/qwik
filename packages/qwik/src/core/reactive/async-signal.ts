import { Brand, brandClass } from '../shared/utils/brand';
import { isServer } from '@qwik.dev/core/build';
import type { QRL } from '../shared/qrl/qrl.public';
import { Computed, type ComputeSignalFn } from './computed';

/** @deprecated Use `ComputeSignalFn` instead. */
export type AsyncSignalFn<T> = ComputeSignalFn<T>;
/** @deprecated Use `ComputeSignalQrl` instead. */
export type AsyncSignalQrl<T> = QRL<AsyncSignalFn<T>>;

/** @deprecated Use `Computed` instead. */
export class AsyncSignal<T> extends Computed<T> {}

isServer && brandClass(AsyncSignal, Brand.AsyncSignal);
