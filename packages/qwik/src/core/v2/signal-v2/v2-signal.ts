import type { QRL } from '../../qrl/qrl.public';
import type { Signal2 as ISignal2 } from './v2-signal.public';

export const createSignal2 = (value?: any) => {
  return new Signal2(value, null);
};

export const createComputedSignal2 = <T>(qrl: QRL<() => T>) => {
  return new Signal2(undefined, qrl);
};

export const isSignal2 = (value: any): value is ISignal2<unknown> => {
  return value instanceof Signal2;
};

class Signal2<T = any> implements ISignal2<T> {
  public untrackedValue: T;

  /**
   * Store a list of effects which are dependent on this signal.
   *
   * An effect is work which needs to be done when the signal changes.
   */
  private $effects$: null | QRL[] = null;

  /** If this signal is computed, then compute function is stored here. */
  private $computeFn$: null | (() => T) | QRL<() => T>;

  constructor(value: T, computeFn: QRL<() => T> | null) {
    this.untrackedValue = value;
    this.$computeFn$ = computeFn;
  }

  get value() {
    return this.untrackedValue;
  }

  set value(value) {
    this.untrackedValue = value;
  }
}
