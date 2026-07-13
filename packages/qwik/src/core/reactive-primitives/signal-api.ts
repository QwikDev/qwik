import type { QRL } from '../shared/qrl/qrl.public';
import { SignalImpl } from './impl/signal-impl';
import { ComputedSignalImpl } from './impl/computed-signal-impl';
import type { Signal } from './signal.public';
import {
  type AsyncQRL,
  type AsyncSignalOptions,
  type ComputedOptions,
  type ComputeQRL,
  type SerializerArg,
} from './types';
import { AsyncSignalImpl } from './impl/async-signal-impl';
import { getComputedSignalFlags } from './utils';
import type { AsyncFn } from '../use/use-async';
import { useSerializerQrl } from '../vdomless/';

/** @internal */
export const createSignal = <T>(value?: T): Signal<T> => {
  return new SignalImpl(null, value as T) as Signal<T>;
};

/** @internal */
export const createComputedSignal = <T>(
  qrl: QRL<() => T>,
  options?: ComputedOptions
): ComputedSignalImpl<T> => {
  void qrl.resolve().catch(() => {});
  return new ComputedSignalImpl<T>(
    options?.container || null,
    qrl as ComputeQRL<T>,
    getComputedSignalFlags(options?.serializationStrategy || 'always')
  );
};

/** @internal */
export const createAsyncSignal = <T>(
  qrl: QRL<AsyncFn<T>>,
  options?: AsyncSignalOptions<T>
): AsyncSignalImpl<T> => {
  void qrl.resolve().catch(() => {});
  return new AsyncSignalImpl<T>(
    options?.container || null,
    qrl as AsyncQRL<T>,
    getComputedSignalFlags(options?.serializationStrategy || 'always'),
    options
  );
};

/** @internal */
export const createSerializerSignal = <T, S>(arg: QRL<SerializerArg<T, S>>) => {
  return useSerializerQrl<T, S>(arg);
};
