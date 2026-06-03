import type { QRLInternal } from '../../shared/qrl/qrl-class';
import type { Container } from '../../shared/types';
import { Computed } from './computed';
import { registerSubscriberToOwner } from './owner';

export type ComputedQrlFn<T> = () => T;
export type ComputedQrlRef<T> = QRLInternal<ComputedQrlFn<T>>;

export class ComputedQrl<T> extends Computed<T> {
  constructor(
    readonly computeQrl: ComputedQrlRef<T>,
    readonly container?: Container
  ) {
    super(computeQrlValue);
  }
}

export function createComputedQrl<T>(
  computeQrl: ComputedQrlRef<T>,
  container?: Container
): ComputedQrl<T> {
  return registerSubscriberToOwner(new ComputedQrl(computeQrl, container));
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === 'function';
}

function computeQrlValue<T>(this: ComputedQrl<T>): T {
  const compute = this.computeQrl.resolved;

  if (compute === undefined) {
    throw this.computeQrl.resolve(this.container);
  }

  const value = compute();
  if (isPromiseLike(value)) {
    throw new Error('Computed QRL must be synchronous');
  }

  return value;
}
