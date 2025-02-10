import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import {
  ComputedSignal,
  SerializerSignal,
  Signal as SignalImpl,
  throwIfQRLNotResolved,
  type SerializerArg,
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
export const createSerializerSignal = <T, S>(
  arg: QRL<{
    serialize: (data: S | undefined) => T;
    deserialize: (data: T) => S;
    initial?: S;
  }>
) => {
  throwIfQRLNotResolved(arg);
  return new SerializerSignal<T, S>(null, arg as any as QRLInternal<SerializerArg<T, S>>);
};
