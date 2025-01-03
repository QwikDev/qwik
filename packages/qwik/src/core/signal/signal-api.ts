import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import {
  ComputedSignal,
  SerializedSignal,
  Signal,
  throwIfQRLNotResolved,
  type ConstructorFn,
  type CustomSerializable,
} from './signal';

/** @internal */
export const createSignal = <T>(value?: T) => {
  return new Signal(null, value);
};

/** @internal */
export const createComputedSignal = <T>(qrl: QRL<() => T>) => {
  throwIfQRLNotResolved(qrl);
  return new ComputedSignal<T>(null, qrl as QRLInternal<() => T>);
};

/** @internal */
export const createSerializedSignal = <
  T extends CustomSerializable<T, S>,
  S,
  F extends ConstructorFn<T, S> = ConstructorFn<T, S>,
>(
  qrl: QRL<F>
) => {
  throwIfQRLNotResolved(qrl);
  return new SerializedSignal<T, S, F>(null, qrl);
};
