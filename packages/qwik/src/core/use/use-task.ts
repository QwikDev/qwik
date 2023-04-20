import { newInvokeContext, invoke, waitAndRun, untrack } from './use-core';
import { logError, logErrorAndStop } from '../util/log';
import { delay, safeCall, then } from '../util/promises';
import { isFunction, isObject, type ValueOrPromise } from '../util/types';
import { isServerPlatform } from '../platform/platform';
import { implicit$FirstArg } from '../util/implicit_dollar';
import { assertDefined, assertEqual } from '../error/assert';
import type { QRL } from '../qrl/qrl.public';
import { assertQrl, assertSignal, createQRL, type QRLInternal } from '../qrl/qrl-class';
import { codeToText, QError_trackUseStore } from '../error/error';
import { useOn, useOnDocument } from './use-on';
import { type ContainerState, intToStr, type MustGetObjID, strToInt } from '../container/container';
import { notifyWatch, _hW } from '../render/dom/notify-render';
import { useSequentialScope } from './use-sequential-scope';
import type { QwikElement } from '../render/dom/virtual-element';
import { handleError } from '../render/error-handling';
import type { RenderContext } from '../render/types';
import { getProxyManager, noSerialize, type NoSerialize, unwrapProxy } from '../state/common';
import {
  isSignal,
  QObjectSignalFlags,
  type Signal,
  type SignalInternal,
  SIGNAL_IMMUTABLE,
  SIGNAL_UNASSIGNED,
  _createSignal,
  type ReadonlySignal,
} from '../state/signal';
import { QObjectManagerSymbol } from '../state/constants';

export const WatchFlagsIsVisibleTask = 1 << 0;
export const WatchFlagsIsTask = 1 << 1;
export const WatchFlagsIsResource = 1 << 2;
export const WatchFlagsIsComputed = 1 << 3;
export const WatchFlagsIsDirty = 1 << 4;
export const WatchFlagsIsCleanup = 1 << 5;

// <docs markdown="../readme.md#Tracker">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#Tracker instead)
/**
 * Used to signal to Qwik which state should be watched for changes.
 *
 * The `Tracker` is passed into the `taskFn` of `useTask`. It is intended to be used to wrap
 * state objects in a read proxy which signals to Qwik which properties should be watched for
 * changes. A change to any of the properties causes the `taskFn` to rerun.
 *
 * ### Example
 *
 * The `obs` passed into the `taskFn` is used to mark `state.count` as a property of interest.
 * Any changes to the `state.count` property will cause the `taskFn` to rerun.
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({ count: 0, doubleCount: 0 });
 *   useTask$(({ track }) => {
 *     const count = track(() => store.count);
 *     store.doubleCount = 2 * count;
 *   });
 *   return (
 *     <div>
 *       <span>
 *         {store.count} / {store.doubleCount}
 *       </span>
 *       <button onClick$={() => store.count++}>+</button>
 *     </div>
 *   );
 * });
 * ```
 *
 * @see `useTask`
 *
 * @public
 */
// </docs>
export interface Tracker {
  /**
   * Include the expression using stores / signals to track:
   *
   * ```tsx
   * track(() => store.value)
   * ```
   *
   * The `track()` function also returns the value of the scoped expression:
   *
   * ```tsx
   * const count = track(() => store.count);
   * ```
   */
  <T>(ctx: () => T): T;

  /**
   * Used to track the whole object. If any property of the passed store changes,
   * the watch will be scheduled to run.
   */
  <T extends {}>(obj: T): T;
}

/**
 * @public
 */
export interface TaskCtx {
  track: Tracker;
  cleanup(callback: () => void): void;
}

/**
 * @public
 */
export interface ResourceCtx<T> {
  readonly track: Tracker;
  cleanup(callback: () => void): void;
  cache(policyOrMilliseconds: number | 'immutable'): void;
  readonly previous: T | undefined;
}

/**
 * @public
 */
export type TaskFn = (ctx: TaskCtx) => ValueOrPromise<void | (() => void)>;

/**
 * @public
 */
export type ComputedFn<T> = () => T;

/**
 * @public
 */
export type ResourceFn<T> = (ctx: ResourceCtx<any>) => ValueOrPromise<T>;

/**
 * @public
 */
export type ResourceReturn<T> = ResourcePending<T> | ResourceResolved<T> | ResourceRejected<T>;

/**
 * @public
 */
export interface ResourcePending<T> {
  readonly value: Promise<T>;
  readonly loading: boolean;
}

/**
 * @public
 */
export interface ResourceResolved<T> {
  readonly value: Promise<T>;
  readonly loading: boolean;
}

/**
 * @public
 */
export interface ResourceRejected<T> {
  readonly value: Promise<T>;
  readonly loading: boolean;
}

export interface ResourceReturnInternal<T> {
  __brand: 'resource';
  _state: 'pending' | 'resolved' | 'rejected';
  _resolved: T | undefined;
  _error: any;
  _cache: number;
  _timeout: number;
  value: Promise<T>;
  loading: boolean;
}
/**
 * @public
 */
export interface DescriptorBase<T = any, B = undefined> {
  $qrl$: QRLInternal<T>;
  $el$: QwikElement;
  $flags$: number;
  $index$: number;
  $destroy$?: NoSerialize<() => void>;
  $state$: B;
}

/**
 * @public
 */
export type EagernessOptions = 'visible' | 'load' | 'idle';

/**
 * @public
 */
export type VisibleTaskStrategy = 'intersection-observer' | 'document-ready' | 'document-idle';

/**
 * @public
 */
export interface OnVisibleTaskOptions {
  /**
   * The strategy to use to determine when the "VisibleTask" should first execute.
   *
   * - `intersection-observer`: the task will first execute when the element is visible in the viewport, under the hood it uses the IntersectionObserver API.
   * - `document-ready`: the task will first execute when the document is ready, under the hood it uses the document `load` event.
   * - `document-idle`: the task will first execute when the document is idle, under the hood it uses the requestIdleCallback API.
   */
  strategy?: VisibleTaskStrategy;
}

/**
 * @public
 */
export interface UseTaskOptions {
  /**
   * - `visible`: run the effect when the element is visible.
   * - `load`: eagerly run the effect when the application resumes.
   */
  eagerness?: EagernessOptions;
}

// <docs markdown="../readme.md#useTask">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useTask instead)
/**
 * Reruns the `taskFn` when the observed inputs change.
 *
 * Use `useTask` to observe changes on a set of inputs, and then re-execute the `taskFn` when
 * those inputs change.
 *
 * The `taskFn` only executes if the observed inputs change. To observe the inputs, use the `obs`
 * function to wrap property reads. This creates subscriptions that will trigger the `taskFn` to
 * rerun.
 *
 * @see `Tracker`
 *
 * @public
 *
 * ### Example
 *
 * The `useTask` function is used to observe the `state.count` property. Any changes to the
 * `state.count` cause the `taskFn` to execute which in turn updates the `state.doubleCount` to
 * the double of `state.count`.
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     count: 0,
 *     doubleCount: 0,
 *     debounced: 0,
 *   });
 *
 *   // Double count watch
 *   useTask$(({ track }) => {
 *     const count = track(() => store.count);
 *     store.doubleCount = 2 * count;
 *   });
 *
 *   // Debouncer watch
 *   useTask$(({ track }) => {
 *     const doubleCount = track(() => store.doubleCount);
 *     const timer = setTimeout(() => {
 *       store.debounced = doubleCount;
 *     }, 2000);
 *     return () => {
 *       clearTimeout(timer);
 *     };
 *   });
 *   return (
 *     <div>
 *       <div>
 *         {store.count} / {store.doubleCount}
 *       </div>
 *       <div>{store.debounced}</div>
 *     </div>
 *   );
 * });
 * ```
 *
 * @param watch - Function which should be re-executed when changes to the inputs are detected
 * @public
 */
// </docs>
export const useTaskQrl = (qrl: QRL<TaskFn>, opts?: UseTaskOptions): void => {
  const { get, set, iCtx, i, elCtx } = useSequentialScope<boolean>();
  if (get) {
    return;
  }
  assertQrl(qrl);

  const containerState = iCtx.$renderCtx$.$static$.$containerState$;
  const watch = new Task(WatchFlagsIsDirty | WatchFlagsIsTask, i, elCtx.$element$, qrl, undefined);
  set(true);
  qrl.$resolveLazy$(containerState.$containerEl$);
  if (!elCtx.$watches$) {
    elCtx.$watches$ = [];
  }
  elCtx.$watches$.push(watch);
  waitAndRun(iCtx, () => runWatch(watch, containerState, iCtx.$renderCtx$));
  if (isServerPlatform()) {
    useRunWatch(watch, opts?.eagerness);
  }
};

interface ComputedQRL {
  <T>(qrl: QRL<ComputedFn<T>>): ReadonlySignal<Awaited<T>>;
}

interface Computed {
  <T>(qrl: ComputedFn<T>): ReadonlySignal<Awaited<T>>;
}

/**
 * @public
 */
export const useComputedQrl: ComputedQRL = <T>(qrl: QRL<ComputedFn<T>>): Signal<Awaited<T>> => {
  const { get, set, iCtx, i, elCtx } = useSequentialScope<Signal<Awaited<T>>>();
  if (get) {
    return get;
  }
  assertQrl(qrl);
  const containerState = iCtx.$renderCtx$.$static$.$containerState$;
  const signal = _createSignal(
    undefined as Awaited<T>,
    containerState,
    SIGNAL_UNASSIGNED | SIGNAL_IMMUTABLE,
    undefined
  );

  const watch = new Task(
    WatchFlagsIsDirty | WatchFlagsIsTask | WatchFlagsIsComputed,
    i,
    elCtx.$element$,
    qrl,
    signal
  );
  qrl.$resolveLazy$(containerState.$containerEl$);
  if (!elCtx.$watches$) {
    elCtx.$watches$ = [];
  }
  elCtx.$watches$.push(watch);

  waitAndRun(iCtx, () => runComputed(watch, containerState, iCtx.$renderCtx$));
  return set(signal);
};

/**
 * @public
 */
export const useComputed$: Computed = implicit$FirstArg(useComputedQrl);

// <docs markdown="../readme.md#useTask">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useTask instead)
/**
 * Reruns the `taskFn` when the observed inputs change.
 *
 * Use `useTask` to observe changes on a set of inputs, and then re-execute the `taskFn` when
 * those inputs change.
 *
 * The `taskFn` only executes if the observed inputs change. To observe the inputs, use the `obs`
 * function to wrap property reads. This creates subscriptions that will trigger the `taskFn` to
 * rerun.
 *
 * @see `Tracker`
 *
 * @public
 *
 * ### Example
 *
 * The `useTask` function is used to observe the `state.count` property. Any changes to the
 * `state.count` cause the `taskFn` to execute which in turn updates the `state.doubleCount` to
 * the double of `state.count`.
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     count: 0,
 *     doubleCount: 0,
 *     debounced: 0,
 *   });
 *
 *   // Double count watch
 *   useTask$(({ track }) => {
 *     const count = track(() => store.count);
 *     store.doubleCount = 2 * count;
 *   });
 *
 *   // Debouncer watch
 *   useTask$(({ track }) => {
 *     const doubleCount = track(() => store.doubleCount);
 *     const timer = setTimeout(() => {
 *       store.debounced = doubleCount;
 *     }, 2000);
 *     return () => {
 *       clearTimeout(timer);
 *     };
 *   });
 *   return (
 *     <div>
 *       <div>
 *         {store.count} / {store.doubleCount}
 *       </div>
 *       <div>{store.debounced}</div>
 *     </div>
 *   );
 * });
 * ```
 *
 * @param watch - Function which should be re-executed when changes to the inputs are detected
 * @public
 */
// </docs>
export const useTask$ = /*#__PURE__*/ implicit$FirstArg(useTaskQrl);

// <docs markdown="../readme.md#useVisibleTask">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useVisibleTask instead)
/**
 * ```tsx
 * const Timer = component$(() => {
 *   const store = useStore({
 *     count: 0,
 *   });
 *
 *   useVisibleTask$(() => {
 *     // Only runs in the client
 *     const timer = setInterval(() => {
 *       store.count++;
 *     }, 500);
 *     return () => {
 *       clearInterval(timer);
 *     };
 *   });
 *
 *   return <div>{store.count}</div>;
 * });
 * ```
 *
 * @public
 */
// </docs>
export const useVisibleTaskQrl = (qrl: QRL<TaskFn>, opts?: OnVisibleTaskOptions): void => {
  const { get, set, i, iCtx, elCtx } = useSequentialScope<Task>();
  const eagerness = opts?.strategy ?? 'intersection-observer';
  if (get) {
    if (isServerPlatform()) {
      useRunWatch(get, eagerness);
    }
    return;
  }
  assertQrl(qrl);
  const watch = new Task(WatchFlagsIsVisibleTask, i, elCtx.$element$, qrl, undefined);
  const containerState = iCtx.$renderCtx$.$static$.$containerState$;
  if (!elCtx.$watches$) {
    elCtx.$watches$ = [];
  }
  elCtx.$watches$.push(watch);
  set(watch);
  useRunWatch(watch, eagerness);
  if (!isServerPlatform()) {
    qrl.$resolveLazy$(containerState.$containerEl$);
    notifyWatch(watch, containerState);
  }
};

// <docs markdown="../readme.md#useVisibleTask">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useVisibleTask instead)
/**
 * ```tsx
 * const Timer = component$(() => {
 *   const store = useStore({
 *     count: 0,
 *   });
 *
 *   useVisibleTask$(() => {
 *     // Only runs in the client
 *     const timer = setInterval(() => {
 *       store.count++;
 *     }, 500);
 *     return () => {
 *       clearInterval(timer);
 *     };
 *   });
 *
 *   return <div>{store.count}</div>;
 * });
 * ```
 *
 * @public
 */
// </docs>
export const useVisibleTask$ = /*#__PURE__*/ implicit$FirstArg(useVisibleTaskQrl);

export type WatchDescriptor = DescriptorBase<TaskFn>;

export interface ResourceDescriptor<T>
  extends DescriptorBase<ResourceFn<T>, ResourceReturnInternal<T>> {}

export interface ComputedDescriptor<T> extends DescriptorBase<ComputedFn<T>, SignalInternal<T>> {}

export type SubscriberHost = QwikElement;

export type SubscriberEffect = WatchDescriptor | ResourceDescriptor<any> | ComputedDescriptor<any>;

export const isResourceTask = (watch: SubscriberEffect): watch is ResourceDescriptor<any> => {
  return (watch.$flags$ & WatchFlagsIsResource) !== 0;
};

export const isComputedTask = (watch: SubscriberEffect): watch is ComputedDescriptor<any> => {
  return (watch.$flags$ & WatchFlagsIsComputed) !== 0;
};
export const runSubscriber = async (
  watch: SubscriberEffect,
  containerState: ContainerState,
  rCtx: RenderContext
) => {
  assertEqual(!!(watch.$flags$ & WatchFlagsIsDirty), true, 'Resource is not dirty', watch);
  if (isResourceTask(watch)) {
    return runResource(watch, containerState, rCtx);
  } else if (isComputedTask(watch)) {
    return runComputed(watch, containerState, rCtx);
  } else {
    return runWatch(watch, containerState, rCtx);
  }
};

export const runResource = <T>(
  watch: ResourceDescriptor<T>,
  containerState: ContainerState,
  rCtx: RenderContext,
  waitOn?: Promise<any>
): ValueOrPromise<void> => {
  watch.$flags$ &= ~WatchFlagsIsDirty;
  cleanupWatch(watch);

  const el = watch.$el$;
  const iCtx = newInvokeContext(rCtx.$static$.$locale$, el, undefined, 'WatchEvent');
  const { $subsManager$: subsManager } = containerState;
  iCtx.$renderCtx$ = rCtx;
  const watchFn = watch.$qrl$.getFn(iCtx, () => {
    subsManager.$clearSub$(watch);
  });

  const cleanups: (() => void)[] = [];
  const resource = watch.$state$;
  assertDefined(
    resource,
    'useResource: when running a resource, "watch.r" must be a defined.',
    watch
  );

  const track: Tracker = (obj: any, prop?: string) => {
    if (isFunction(obj)) {
      const ctx = newInvokeContext();
      ctx.$renderCtx$ = rCtx;
      ctx.$subscriber$ = [0, watch];
      return invoke(ctx, obj);
    }
    const manager = getProxyManager(obj);
    if (manager) {
      manager.$addSub$([0, watch], prop);
    } else {
      logErrorAndStop(codeToText(QError_trackUseStore), obj);
    }
    if (prop) {
      return obj[prop];
    } else if (isSignal(obj)) {
      return obj.value;
    } else {
      return obj;
    }
  };
  const resourceTarget = unwrapProxy(resource);
  const opts: ResourceCtx<T> = {
    track,
    cleanup(callback) {
      cleanups.push(callback);
    },
    cache(policy) {
      let milliseconds = 0;
      if (policy === 'immutable') {
        milliseconds = Infinity;
      } else {
        milliseconds = policy;
      }
      resource._cache = milliseconds;
    },
    previous: resourceTarget._resolved,
  };

  let resolve: (v: T) => void;
  let reject: (v: any) => void;
  let done = false;

  const setState = (resolved: boolean, value: any) => {
    if (!done) {
      done = true;
      if (resolved) {
        done = true;
        resource.loading = false;
        resource._state = 'resolved';
        resource._resolved = value;
        resource._error = undefined;

        resolve(value);
      } else {
        done = true;
        resource.loading = false;
        resource._state = 'rejected';
        resource._error = value;
        reject(value);
      }
      return true;
    }
    return false;
  };

  // Execute mutation inside empty invocation
  invoke(iCtx, () => {
    resource._state = 'pending';
    resource.loading = !isServerPlatform();
    resource.value = new Promise((r, re) => {
      resolve = r;
      reject = re;
    });
  });

  watch.$destroy$ = noSerialize(() => {
    done = true;
    cleanups.forEach((fn) => fn());
  });

  const promise = safeCall(
    () => then(waitOn, () => watchFn(opts)),
    (value) => {
      setState(true, value);
    },
    (reason) => {
      setState(false, reason);
    }
  );

  const timeout = resourceTarget._timeout;
  if (timeout > 0) {
    return Promise.race([
      promise,
      delay(timeout).then(() => {
        if (setState(false, new Error('timeout'))) {
          cleanupWatch(watch);
        }
      }),
    ]);
  }
  return promise;
};

export const runWatch = (
  watch: WatchDescriptor | ComputedDescriptor<any>,
  containerState: ContainerState,
  rCtx: RenderContext
): ValueOrPromise<void> => {
  watch.$flags$ &= ~WatchFlagsIsDirty;

  cleanupWatch(watch);
  const hostElement = watch.$el$;
  const iCtx = newInvokeContext(rCtx.$static$.$locale$, hostElement, undefined, 'WatchEvent');
  iCtx.$renderCtx$ = rCtx;
  const { $subsManager$: subsManager } = containerState;
  const watchFn = watch.$qrl$.getFn(iCtx, () => {
    subsManager.$clearSub$(watch);
  }) as TaskFn;
  const track: Tracker = (obj: any, prop?: string) => {
    if (isFunction(obj)) {
      const ctx = newInvokeContext();
      ctx.$subscriber$ = [0, watch];
      return invoke(ctx, obj);
    }
    const manager = getProxyManager(obj);
    if (manager) {
      manager.$addSub$([0, watch], prop);
    } else {
      logErrorAndStop(codeToText(QError_trackUseStore), obj);
    }
    if (prop) {
      return obj[prop];
    } else {
      return obj;
    }
  };
  const cleanups: (() => void)[] = [];
  watch.$destroy$ = noSerialize(() => {
    cleanups.forEach((fn) => fn());
  });

  const opts: TaskCtx = {
    track,
    cleanup(callback) {
      cleanups.push(callback);
    },
  };
  return safeCall(
    () => watchFn(opts),
    (returnValue) => {
      if (isFunction(returnValue)) {
        cleanups.push(returnValue);
      }
    },
    (reason) => {
      handleError(reason, hostElement, rCtx);
    }
  );
};

export const runComputed = (
  watch: ComputedDescriptor<any>,
  containerState: ContainerState,
  rCtx: RenderContext
): ValueOrPromise<void> => {
  assertSignal(watch.$state$);
  watch.$flags$ &= ~WatchFlagsIsDirty;
  cleanupWatch(watch);
  const hostElement = watch.$el$;
  const iCtx = newInvokeContext(rCtx.$static$.$locale$, hostElement, undefined, 'ComputedEvent');
  iCtx.$subscriber$ = [0, watch];
  iCtx.$renderCtx$ = rCtx;

  const { $subsManager$: subsManager } = containerState;
  const watchFn = watch.$qrl$.getFn(iCtx, () => {
    subsManager.$clearSub$(watch);
  }) as ComputedFn<unknown>;

  return safeCall(
    watchFn,
    (returnValue) =>
      untrack(() => {
        const signal = watch.$state$;
        signal[QObjectSignalFlags] &= ~SIGNAL_UNASSIGNED;
        signal.untrackedValue = returnValue;
        signal[QObjectManagerSymbol].$notifySubs$();
      }),
    (reason) => {
      handleError(reason, hostElement, rCtx);
    }
  );
};

export const cleanupWatch = (watch: SubscriberEffect) => {
  const destroy = watch.$destroy$;
  if (destroy) {
    watch.$destroy$ = undefined;
    try {
      destroy();
    } catch (err) {
      logError(err);
    }
  }
};

export const destroyWatch = (watch: SubscriberEffect) => {
  if (watch.$flags$ & WatchFlagsIsCleanup) {
    watch.$flags$ &= ~WatchFlagsIsCleanup;
    const cleanup = watch.$qrl$;
    (cleanup as any)();
  } else {
    cleanupWatch(watch);
  }
};

const useRunWatch = (
  watch: SubscriberEffect,
  eagerness: VisibleTaskStrategy | EagernessOptions | undefined
) => {
  if (eagerness === 'visible' || eagerness === 'intersection-observer') {
    useOn('qvisible', getWatchHandlerQrl(watch));
  } else if (eagerness === 'load' || eagerness === 'document-ready') {
    useOnDocument('qinit', getWatchHandlerQrl(watch));
  } else if (eagerness === 'idle' || eagerness === 'document-idle') {
    useOnDocument('qidle', getWatchHandlerQrl(watch));
  }
};

const getWatchHandlerQrl = (watch: SubscriberEffect) => {
  const watchQrl = watch.$qrl$;
  const watchHandler = createQRL(
    watchQrl.$chunk$,
    '_hW',
    _hW,
    null,
    null,
    [watch],
    watchQrl.$symbol$
  );
  return watchHandler;
};

export const isWatchCleanup = (obj: any): obj is WatchDescriptor => {
  return isSubscriberDescriptor(obj) && !!(obj.$flags$ & WatchFlagsIsCleanup);
};

export const isSubscriberDescriptor = (obj: any): obj is SubscriberEffect => {
  return isObject(obj) && obj instanceof Task;
};

export const serializeWatch = (watch: SubscriberEffect, getObjId: MustGetObjID) => {
  let value = `${intToStr(watch.$flags$)} ${intToStr(watch.$index$)} ${getObjId(
    watch.$qrl$
  )} ${getObjId(watch.$el$)}`;
  if (watch.$state$) {
    value += ` ${getObjId(watch.$state$)}`;
  }
  return value;
};

export const parseTask = (data: string) => {
  const [flags, index, qrl, el, resource] = data.split(' ');
  return new Task(strToInt(flags), strToInt(index), el as any, qrl as any, resource as any);
};

export class Task<T = undefined> implements DescriptorBase<any, T> {
  constructor(
    public $flags$: number,
    public $index$: number,
    public $el$: QwikElement,
    public $qrl$: QRLInternal<any>,
    public $state$: T
  ) {}
}
