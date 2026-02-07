import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { SignalImpl } from './impl/signal-impl';
import { ComputedSignalImpl } from './impl/computed-signal-impl';
import type { Signal } from './signal.public';
import {
  type AsyncCtx,
  type AsyncQRL,
  type AsyncSignalOptions,
  type ComputedOptions,
  type ComputeQRL,
  type SerializerArg,
} from './types';
import { SerializerSignalImpl } from './impl/serializer-signal-impl';
import { AsyncSignalImpl } from './impl/async-signal-impl';
import { getComputedSignalFlags } from './utils';

/** @internal */
export const createSignal = <T>(value?: T): Signal<T> => {
  return new SignalImpl(null, value as T) as Signal<T>;
};

/** @internal */
export const createComputedSignal = <T>(
  qrl: QRL<() => T>,
  options?: ComputedOptions
): ComputedSignalImpl<T> => {
  return new ComputedSignalImpl<T>(
    options?.container || null,
    qrl as ComputeQRL<T>,
    getComputedSignalFlags(options?.serializationStrategy || 'always')
  );
};

/** @internal */
export const createAsyncSignal = <T>(
  qrl: QRL<(ctx: AsyncCtx) => Promise<T>>,
  options?: AsyncSignalOptions<T>
): AsyncSignalImpl<T> => {
  return new AsyncSignalImpl<T>(
    options?.container || null,
    qrl as AsyncQRL<T>,
    getComputedSignalFlags(options?.serializationStrategy || 'always'),
    options
  );
};

/** @internal */
export const createSerializerSignal = <T, S>(
  arg: QRL<{
    serialize: (data: S | undefined) => T;
    deserialize: (data: T) => S;
    initial?: S;
  }>
) => {
  return new SerializerSignalImpl<T, S>(null, arg as any as QRLInternal<SerializerArg<T, S>>);
};
