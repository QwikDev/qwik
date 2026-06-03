import { Computed } from './computed';

export type ComputedQrlFn<T> = () => T;

export interface ComputedQrlRef<T> {
  resolved: ComputedQrlFn<T> | undefined;
  resolve(container?: unknown): Promise<ComputedQrlFn<T>>;
}

export class ComputedQrl<T> extends Computed<T> {
  constructor(
    readonly computeQrl: ComputedQrlRef<T>,
    readonly container?: unknown
  ) {
    super(computeQrlValue);
  }
}

export function createComputedQrl<T>(
  computeQrl: ComputedQrlRef<T>,
  container?: unknown
): ComputedQrl<T> {
  return new ComputedQrl(computeQrl, container);
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
