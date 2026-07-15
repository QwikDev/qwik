import { isQwikComponent } from '../shared/component.public';
import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import type { ValueOrPromise } from '../shared/utils/types';
import type { ContainerContext } from '../runtime/container-context';
import { getActiveInvokeContextOrNull } from '../runtime/invoke-context';
import { registerSubscriberToOwner } from '../runtime/owner';
import { AsyncSignal, AsyncSignalFn, type AsyncSignalQrl } from './async-signal';
import { disposeSubscriber } from './cleanup';
import { Computed, readComputedUntracked } from './computed';
import { ComputedQrl, type ComputedQrlRef } from './computed-qrl';
import {
  SerializerArgObjectWithInitial,
  SerializerSignal,
  type UseSerializerDollar,
  type SerializerArgFactoryWithInitial,
  type SerializerSignalQrl,
} from './serializer-signal';
import { Signal } from './signal';
import type { Source } from './source';
import { untrack } from './tracking';
import type {
  AsyncCtx,
  AsyncSignalOptions,
  ComputedSignal,
  PublicAsyncSignal,
  SerializerArg,
} from './public-types';

/** Constant */

/** @public */
export function useConstant<T, A extends unknown[]>(value: T | ((...args: A) => T), ...args: A): T {
  return typeof value === 'function' && !isQwikComponent(value)
    ? untrack(value as (...args: A) => T, ...args)
    : (value as T);
}

/** Signal */

/** @public */
export function useSignal<T>(): Signal<T | undefined>;
/** @public */
export function useSignal<T>(value: T): Signal<T>;
export function useSignal<T>(value?: T): Signal<T | undefined> {
  return new Signal(value);
}

/** Computed */

export function useComputed<T>(compute: () => T): Computed<T> {
  return registerSubscriberToOwner(new Computed(compute));
}

export function _wrapArray<T>(
  computeQrl: ComputedQrlRef<readonly T[]>,
  keepSource = false
): readonly T[] | Source<readonly T[]> {
  const computed = useComputedQrl(computeQrl);
  let value: readonly T[];
  try {
    value = readComputedUntracked(computed);
  } catch (error) {
    disposeSubscriber(computed);
    throw error;
  }
  if (!keepSource && (computed.deps === null || computed.deps.length === 0)) {
    disposeSubscriber(computed);
    return value;
  }
  return computed;
}

export function useComputedQrl<T>(
  computeQrl: ComputedQrlRef<T>,
  container?: ContainerContext
): ComputedQrl<T> {
  const contextContainer = container ?? getActiveInvokeContextOrNull()?.container;
  const computed = new ComputedQrl(computeQrl, contextContainer);
  void computed.computeQrl.resolve(contextContainer).catch(() => {});
  return registerSubscriberToOwner(computed);
}

/** @public */
export const useComputed$: <T>(qrl: () => T) => ComputedSignal<T> = /*#__PURE__*/ implicit$FirstArg(
  useComputedQrl as any
);

/** Async */

export function useAsync<T>(
  compute: AsyncSignalFn<T>,
  options?: AsyncSignalOptions<T>
): AsyncSignal<T> {
  return registerSubscriberToOwner(
    new AsyncSignal<T>(null, compute, getActiveInvokeContextOrNull()?.container, options)
  );
}

export function useAsyncQrl<T>(
  computeQrl: AsyncSignalQrl<T>,
  options?: AsyncSignalOptions<T>
): AsyncSignal<T> {
  const container = getActiveInvokeContextOrNull()?.container;
  const signal = new AsyncSignal<T>(computeQrl, null, container, options);
  void (signal.computeQrl as QRLInternal<AsyncSignalFn<T>>).resolve(container).catch(() => {});
  return registerSubscriberToOwner(signal);
}

/** @public */
export const useAsync$: <T>(
  qrl: (ctx: AsyncCtx<T>) => ValueOrPromise<T>,
  options?: AsyncSignalOptions<T>
) => PublicAsyncSignal<T> = /*#__PURE__*/ implicit$FirstArg(useAsyncQrl as any);

/** Serializer */

export function useSerializer<T, S>(
  arg: SerializerArgObjectWithInitial<T, S>
): SerializerSignal<T, S>;
export function useSerializer<T, S>(
  arg: SerializerArgFactoryWithInitial<T, S>
): SerializerSignal<T, S>;
export function useSerializer<T, S>(arg: SerializerArg<T, S>): SerializerSignal<T, S>;
export function useSerializer<T, S>(arg: SerializerArg<T, S>): SerializerSignal<T, S> {
  return registerSubscriberToOwner(
    new SerializerSignal<T, S>(null, getActiveInvokeContextOrNull()?.container, arg)
  );
}

export function useSerializerQrl<T, S>(argQrl: QRL<SerializerArg<T, S>>): SerializerSignal<T, S> {
  const container = getActiveInvokeContextOrNull()?.container;
  const signal = new SerializerSignal<T, S>(argQrl as SerializerSignalQrl<T, S>, container);
  void signal.argQrl!.resolve(container).catch(() => {});
  return registerSubscriberToOwner(signal);
}

/** @public */
export const useSerializer$: UseSerializerDollar = /*#__PURE__*/ implicit$FirstArg(
  useSerializerQrl as any
);
