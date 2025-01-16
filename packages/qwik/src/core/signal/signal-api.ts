import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import {
  ComputedSignal,
  SerializedSignal,
  Signal as SignalImpl,
  throwIfQRLNotResolved,
  type ConstructorFn,
  type CustomSerializable,
} from './signal';
import type { Signal } from './signal.public';

/** @internal */
export const createSignal = <T>(value?: T): Signal<T> => {
  return new SignalImpl(null, value as T) as Signal<T>;
};

/** @internal */
export const createComputedSignal = <T>(qrl: QRL<() => T>): ComputedSignal<T> => {
  throwIfQRLNotResolved(qrl);
  return new ComputedSignal<T>(null, qrl as QRLInternal<() => T>);
};

/** @internal */
export const createSerializedSignal = <T extends CustomSerializable<T, S>, S>(
  qrl: QRL<ConstructorFn<T, S>>
) => {
  throwIfQRLNotResolved(qrl);
  return new SerializedSignal<T>(null, qrl);
};
