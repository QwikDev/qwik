import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { ValueOrPromise } from '../shared/utils/types';
import { Computed } from './computed';
import type { ContainerContext } from '../runtime/container-context';
import type { ComputedOptions, ComputeCtx } from './public-types';

export type ComputedQrlFn<T> = (ctx: ComputeCtx<T>) => ValueOrPromise<T>;
export type ComputedQrlRef<T> = QRLInternal<ComputedQrlFn<T>>;

export class ComputedQrl<T> extends Computed<T> {
  constructor(
    computeQrl: ComputedQrlRef<T>,
    container?: ContainerContext,
    options?: ComputedOptions<T>
  ) {
    super(computeQrl, null, container, options);
  }
}
