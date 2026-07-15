import type { QRLInternal } from '../shared/qrl/qrl-class';
import { isPromise } from '../shared/utils/promises';
import { Computed } from './computed';
import type { ContainerContext } from '../runtime/container-context';
import { getFunctionOrResolve } from '../utils/qrl';

export type ComputedQrlFn<T> = () => T;
export type ComputedQrlRef<T> = QRLInternal<ComputedQrlFn<T>>;

export class ComputedQrl<T> extends Computed<T> {
  constructor(
    readonly computeQrl: ComputedQrlRef<T>,
    readonly container?: ContainerContext
  ) {
    super(computeQrlValue);
  }
}

function computeQrlValue<T>(this: ComputedQrl<T>): T {
  const compute = getFunctionOrResolve(this.computeQrl, this.container);

  if (isPromise(compute)) {
    throw compute;
  }

  const value = compute();
  if (isPromise(value)) {
    throw new Error('Computed QRL must be synchronous');
  }

  return value;
}
