import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import { assertQrl } from '../shared/qrl/qrl-utils';
import type { QRL } from '../shared/qrl/qrl.public';
import { isSignal, throwIfQRLNotResolved } from '../reactive-primitives/utils';
import {
  createSignal,
  type ReadonlySignal,
  type Signal,
} from '../reactive-primitives/signal.public';
import { useSequentialScope } from './use-sequential-scope';
import { ChoreType } from '../shared/util-chore-type';
import { Task, TaskFlags, type TaskCtx, type TaskFn, type Tracker } from './use-task';
import type { Container, HostElement } from '../shared/types';
import { isFunction, type ValueOrPromise } from '../shared/utils/types';
import { invoke, newInvokeContext, untrack } from './use-core';
import { AsyncComputedEvent } from '../shared/utils/markers';
import { getSubscriber } from '../reactive-primitives/subscriber';
import { EffectProperty, STORE_ALL_PROPS } from '../reactive-primitives/types';
import { clearAllEffects } from '../reactive-primitives/cleanup';
import { isPromise, safeCall } from '../shared/utils/promises';
import { isStore } from '../reactive-primitives/impl/store';
import { addStoreEffect } from '../reactive-primitives/impl/store';
import { getStoreTarget } from '../reactive-primitives/impl/store';
import { QError } from '../shared/error/error';
import { qError } from '../shared/error/error';
import { getStoreHandler } from '../reactive-primitives/impl/store';
import { noSerialize } from '../shared/utils/serialize-utils';
import type { SignalImpl } from '../reactive-primitives/impl/signal-impl';

/** @public */
export type AsyncComputedFn<T> = (ctx: TaskCtx) => Promise<T>;
/** @public */
export type AsyncComputedReturnType<T> =
  T extends Promise<infer T> ? ReadonlySignal<T> : ReadonlySignal<T>;

export const runAsyncComputed = (
  task: Task,
  container: Container,
  host: HostElement
): ValueOrPromise<void> => {
  task.$flags$ &= ~TaskFlags.DIRTY;
  const iCtx = newInvokeContext(container.$locale$, host, undefined, AsyncComputedEvent);
  iCtx.$container$ = container;

  const taskFn = task.$qrl$.getFn(iCtx, () => clearAllEffects(container, task)) as TaskFn;

  const handleError = (reason: unknown) => container.handleError(reason, host);

  const track: Tracker = (obj: (() => unknown) | object | Signal<unknown>, prop?: string) => {
    const ctx = newInvokeContext();
    ctx.$effectSubscriber$ = getSubscriber(task, EffectProperty.COMPONENT);
    ctx.$container$ = container;
    return invoke(ctx, () => {
      if (isFunction(obj)) {
        return obj();
      }
      if (prop) {
        return (obj as Record<string, unknown>)[prop];
      } else if (isSignal(obj)) {
        return obj.value;
      } else if (isStore(obj)) {
        // track whole store
        addStoreEffect(
          getStoreTarget(obj)!,
          STORE_ALL_PROPS,
          getStoreHandler(obj)!,
          ctx.$effectSubscriber$!
        );
        return obj;
      } else {
        throw qError(QError.trackObjectWithoutProp);
      }
    });
  };

  let cleanupFns: (() => void)[] | null = null;
  const cleanup = (fn: () => void) => {
    if (typeof fn == 'function') {
      if (!cleanupFns) {
        cleanupFns = [];
        task.$destroy$ = noSerialize(() => {
          task.$destroy$ = null;
          cleanupFns!.forEach((fn) => {
            try {
              fn();
            } catch (err) {
              handleError(err);
            }
          });
        });
      }
      cleanupFns.push(fn);
    }
  };

  const taskApi: TaskCtx = { track, cleanup };
  const result = safeCall(
    () => taskFn(taskApi),
    (returnValue) =>
      untrack(() => {
        const signal = task.$state$! as SignalImpl<unknown>;
        signal.value = returnValue;
      }),
    handleError
  );
  return result;
};

/** @internal */
export const useAsyncComputedQrl = <T>(
  qrl: QRL<AsyncComputedFn<T>>
): AsyncComputedReturnType<T> => {
  const { val, set, iCtx, i } = useSequentialScope<Signal<Promise<T>>>();
  if (val) {
    return val as any;
  }
  assertQrl(qrl);
  const signal = createSignal(iCtx.$container$) as any;
  set(signal);

  const task = new Task(
    TaskFlags.DIRTY | TaskFlags.ASYNC_COMPUTED,
    i,
    iCtx.$hostElement$,
    qrl,
    signal,
    null
  );

  // Note that we first save the signal
  // and then we throw to load the qrl
  // This is why we can't use useConstant, we need to keep using the same qrl object
  throwIfQRLNotResolved(qrl);

  const container = iCtx.$container$;
  const promise = container.$scheduler$(ChoreType.ASYNC_COMPUTED, task);
  if (isPromise(promise)) {
    // TODO: should we handle this differently?
    promise.catch(() => {});
  }
  return signal as unknown as AsyncComputedReturnType<T>;
};

/**
 * Creates a computed signal which is calculated from the given function. A computed signal is a
 * signal which is calculated from other signals. When the signals change, the computed signal is
 * recalculated, and if the result changed, all tasks which are tracking the signal will be re-run
 * and all components that read the signal will be re-rendered.
 *
 * The function must be synchronous and must not have any side effects.
 *
 * @public
 */
export const useAsyncComputed$ = implicit$FirstArg(useAsyncComputedQrl);
