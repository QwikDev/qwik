import type { AsyncSignal as PublicAsyncSignal } from '../../reactive-primitives/signal.public';
import type { AsyncCtx, AsyncSignalOptions } from '../../reactive-primitives/types';
import { implicit$FirstArg } from '../../shared/qrl/implicit_dollar';
import type { QRLInternal } from '../../shared/qrl/qrl-class';
import type { ValueOrPromise } from '../../shared/utils/types';
import type { ContainerContext } from '../runtime/container-context';
import { getActiveInvokeContextOrNull } from '../runtime/invoke-context';
import { registerSubscriberToOwner } from '../runtime/owner';
import { AsyncSignal, AsyncSignalFn, type AsyncSignalQrl } from './async-signal';
import { Computed } from './computed';
import { ComputedQrl, ComputedQrlRef } from './computed-qrl';
import { Signal } from './signal';

/** Signal */

export function useSignal<T>(): Signal<T | undefined>;
export function useSignal<T>(value: T): Signal<T>;
export function useSignal<T>(value?: T): Signal<T | undefined> {
  return new Signal(value);
}

/** Computed */

export function useComputed<T>(compute: () => T): Computed<T> {
  return registerSubscriberToOwner(new Computed(compute));
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

export const useComputed$: <T>(qrl: () => T) => Computed<T> = /*#__PURE__*/ implicit$FirstArg(
  useComputedQrl as any
);

/** AsyncSignal */

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

export const useAsync$: <T>(
  qrl: (ctx: AsyncCtx<T>) => ValueOrPromise<T>,
  options?: AsyncSignalOptions<T>
) => PublicAsyncSignal<T> = /*#__PURE__*/ implicit$FirstArg(useAsyncQrl as any);
