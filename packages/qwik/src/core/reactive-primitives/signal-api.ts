import type { QRLInternal } from '../shared/qrl/qrl-class';
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
import { SerializerSignalImpl } from './impl/serializer-signal-impl';
import { AsyncSignalImpl } from './impl/async-signal-impl';
import { getComputedSignalFlags } from './utils';
import type { ComputedFn } from '../use/use-computed';
import { tryGetInvokeContext } from '../use/use-core';
import { ELEMENT_SEQ, RenderEvent } from '../shared/utils/markers';

/** A signal made while a component renders belongs to that component, which disposes it. */
const ownedByRenderingComponent = <S extends ComputedSignalImpl<any, any>>(signal: S): S => {
  const iCtx = tryGetInvokeContext();
  if (iCtx && iCtx.$event$ === RenderEvent) {
    signal.$ownerSeq$ =
      iCtx.$container$!.getHostProp<unknown[]>(iCtx.$hostElement$!, ELEMENT_SEQ) || undefined;
  }
  return signal;
};

/** @internal */
export const createSignal = <T>(value?: T): Signal<T> => {
  return new SignalImpl(null, value as T) as Signal<T>;
};

/** @internal */
export const createComputedSignal = <T>(
  qrl: QRL<ComputedFn<T>>,
  options?: ComputedOptions<T>
): ComputedSignalImpl<T> => {
  return ownedByRenderingComponent(
    new ComputedSignalImpl<T>(
      options?.container || null,
      qrl as ComputeQRL<T>,
      getComputedSignalFlags(options?.serializationStrategy || 'always'),
      options
    )
  );
};

/** @internal */
export const createAsyncSignal = <T>(
  qrl: QRL<ComputedFn<T>>,
  options?: AsyncSignalOptions<T>
): AsyncSignalImpl<T> => {
  return ownedByRenderingComponent(
    new AsyncSignalImpl<T>(
      options?.container || null,
      qrl as AsyncQRL<T>,
      getComputedSignalFlags(options?.serializationStrategy || 'always'),
      options
    )
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
  return ownedByRenderingComponent(
    new SerializerSignalImpl<T, S>(null, arg as any as QRLInternal<SerializerArg<T, S>>)
  );
};
