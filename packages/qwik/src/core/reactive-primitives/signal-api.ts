import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { SignalImpl } from './impl/signal-impl';
import { ComputedSignalImpl } from './impl/computed-signal-impl';
import { throwIfQRLNotResolved } from './utils';
import type { Signal } from './signal.public';
import type { AsyncComputedCtx, AsyncComputeQRL, ComputeQRL, SerializerArg } from './types';
import { SerializerSignalImpl } from './impl/serializer-signal-impl';
import { AsyncComputedSignalImpl } from './impl/async-computed-signal-impl';

/** @internal */
export const createSignal = <T>(value?: T): Signal<T> => {
  return new SignalImpl(null, value as T) as Signal<T>;
};

/** @internal */
export const createComputedSignal = <T>(qrl: QRL<() => T>): ComputedSignalImpl<T> => {
  throwIfQRLNotResolved(qrl);
  return new ComputedSignalImpl<T>(null, qrl as ComputeQRL<T>);
};

/** @internal */
export const createAsyncComputedSignal = <T>(
  qrl: QRL<(ctx: AsyncComputedCtx) => Promise<T>>
): AsyncComputedSignalImpl<T> => {
  throwIfQRLNotResolved(qrl);
  return new AsyncComputedSignalImpl<T>(null, qrl as AsyncComputeQRL<T>);
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
  return new SerializerSignalImpl<T, S>(null, arg as any as QRLInternal<SerializerArg<T, S>>);
};
