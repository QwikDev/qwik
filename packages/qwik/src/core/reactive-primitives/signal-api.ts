import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { SignalImpl } from './impl/signal-impl';
import { ComputedSignalImpl } from './impl/computed-signal-impl';
import type { Signal } from './signal.public';
import {
  type AsyncComputedCtx,
  type AsyncComputeQRL,
  type ComputedOptions,
  type ComputeQRL,
  type SerializerArg,
} from './types';
import { SerializerSignalImpl } from './impl/serializer-signal-impl';
import { AsyncComputedSignalImpl } from './impl/async-computed-signal-impl';
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
    getComputedSignalFlags(options?.serializationStrategy || 'never')
  );
};

/** @internal */
export const createAsyncComputedSignal = <T>(
  qrl: QRL<(ctx: AsyncComputedCtx) => Promise<T>>,
  options?: ComputedOptions
): AsyncComputedSignalImpl<T> => {
  return new AsyncComputedSignalImpl<T>(
    options?.container || null,
    qrl as AsyncComputeQRL<T>,
    getComputedSignalFlags(options?.serializationStrategy || 'never')
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
