import { newInvokeContext, invoke, waitAndRun } from './use-core';
import { logError, logErrorAndStop } from '../util/log';
import { delay, safeCall, then } from '../util/promises';
import { isFunction, isObject, ValueOrPromise } from '../util/types';
import { isServer } from '../platform/platform';
import { implicit$FirstArg } from '../util/implicit_dollar';
import { assertDefined, assertEqual } from '../error/assert';
import type { QRL } from '../qrl/qrl.public';
import { assertQrl, createQRL, QRLInternal } from '../qrl/qrl-class';
import {
  codeToText,
  qError,
  QError_canNotMountUseServerMount,
  QError_trackUseStore,
} from '../error/error';
import { useOn, useOnDocument } from './use-on';
import { ContainerState, intToStr, MustGetObjID, strToInt } from '../container/container';
import { notifyWatch, _hW } from '../render/dom/notify-render';
import { useSequentialScope } from './use-sequential-scope';
import type { QwikElement } from '../render/dom/virtual-element';
import { handleError } from '../render/error-handling';
import type { RenderContext } from '../render/types';
import { getProxyManager, noSerialize, NoSerialize, unwrapProxy } from '../state/common';
import { getContext } from '../state/context';
import { isSignal } from '../state/signal';

export const WatchFlagsIsEffect = 1 << 0;
export const WatchFlagsIsWatch = 1 << 1;
export const WatchFlagsIsDirty = 1 << 2;
export const WatchFlagsIsCleanup = 1 << 3;
export const WatchFlagsIsResource = 1 << 4;

// <docs markdown="../readme.md#Tracker">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#Tracker instead)
/**
 * Used to signal to Qwik which state should be watched for changes.
 *
 * The `Tracker` is passed into the `watchFn` of `useWatch`. It is intended to be used to wrap
 * state objects in a read proxy which signals to Qwik which properties should be watched for
 * changes. A change to any of the properties causes the `watchFn` to rerun.
 *
 * ### Example
 *
 * The `obs` passed into the `watchFn` is used to mark `state.count` as a property of interest.
 * Any changes to the `state.count` property will cause the `watchFn` to rerun.
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({ count: 0, doubleCount: 0 });
 *   useWatch$(({ track }) => {
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
 * @see `useWatch`
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

  /**
   * @deprecated Use the `track(() => store.value)` instead
   */
  <T extends {}, B extends keyof T>(obj: T, prop: B): T[B];
}

/**
 * @public
 */
export interface WatchCtx {
  track: Tracker;
  cleanup(callback: () => void): void;
}

/**
 * @public
 */
export interface ResourceCtx<T> {
  track: Tracker;
  cleanup(callback: () => void): void;
  cache(policyOrMilliseconds: number | 'immutable'): void;
  previous: T | undefined;
}

/**
 * @public
 */
export type WatchFn = (ctx: WatchCtx) => ValueOrPromise<void | (() => void)>;

/**
 * @public
 */
export type ResourceFn<T> = (ctx: ResourceCtx<T>) => ValueOrPromise<T>;

/**
 * @public
 */
export type MountFn<T> = () => ValueOrPromise<T>;

/**
 * @public
 */
export type ResourceReturn<T> = ResourcePending<T> | ResourceResolved<T> | ResourceRejected<T>;

/**
 * @public
 */
export interface ResourcePending<T> {
  promise: Promise<T>;
  loading: boolean;
}

/**
 * @public
 */
export interface ResourceResolved<T> {
  promise: Promise<T>;
  loading: boolean;
}

/**
 * @public
 */
export interface ResourceRejected<T> {
  promise: Promise<T>;
  loading: boolean;
}

export interface ResourceReturnInternal<T> {
  __brand: 'resource';
  _state: 'pending' | 'resolved' | 'rejected';
  _resolved: T | undefined;
  _error: any;
  _cache: number;
  _timeout: number;

  promise: Promise<T>;
  loading: boolean;
}
/**
 * @alpha
 */
export interface DescriptorBase<T = any, B = undefined> {
  $qrl$: QRLInternal<T>;
  $el$: QwikElement;
  $flags$: number;
  $index$: number;
  $destroy$?: NoSerialize<() => void>;
  $resource$: B;
}

/**
 * @public
 */
export type EagernessOptions = 'visible' | 'load' | 'idle';

/**
 * @public
 */
export interface UseEffectOptions {
  /**
   * - `visible`: run the effect when the element is visible.
   * - `load`: eagerly run the effect when the application resumes.
   */
  eagerness?: EagernessOptions;
}

/**
 * @public
 */
export interface UseWatchOptions {
  /**
   * - `visible`: run the effect when the element is visible.
   * - `load`: eagerly run the effect when the application resumes.
   */
  eagerness?: EagernessOptions;
}

// <docs markdown="../readme.md#useWatch">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useWatch instead)
/**
 * Reruns the `watchFn` when the observed inputs change.
 *
 * Use `useWatch` to observe changes on a set of inputs, and then re-execute the `watchFn` when
 * those inputs change.
 *
 * The `watchFn` only executes if the observed inputs change. To observe the inputs, use the
 * `obs` function to wrap property reads. This creates subscriptions that will trigger the
 * `watchFn` to rerun.
 *
 * @see `Tracker`
 *
 * @public
 *
 * ### Example
 *
 * The `useWatch` function is used to observe the `state.count` property. Any changes to the
 * `state.count` cause the `watchFn` to execute which in turn updates the `state.doubleCount` to
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
 *   useWatch$(({ track }) => {
 *     const count = track(() => store.count);
 *     store.doubleCount = 2 * count;
 *   });
 *
 *   // Debouncer watch
 *   useWatch$(({ track }) => {
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
export const useWatchQrl = (qrl: QRL<WatchFn>, opts?: UseWatchOptions): void => {
  const { get, set, ctx, i } = useSequentialScope<boolean>();
  if (get) {
    return;
  }
  assertQrl(qrl);

  const el = ctx.$hostElement$;
  const containerState = ctx.$renderCtx$.$static$.$containerState$;
  const watch = new Watch(WatchFlagsIsDirty | WatchFlagsIsWatch, i, el, qrl, undefined);
  const elCtx = getContext(el);
  set(true);
  qrl.$resolveLazy$(containerState.$containerEl$);
  if (!elCtx.$watches$) {
    elCtx.$watches$ = [];
  }
  elCtx.$watches$.push(watch);
  waitAndRun(ctx, () => runSubscriber(watch, containerState, ctx.$renderCtx$));
  if (isServer()) {
    useRunWatch(watch, opts?.eagerness);
  }
};

// <docs markdown="../readme.md#useWatch">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useWatch instead)
/**
 * Reruns the `watchFn` when the observed inputs change.
 *
 * Use `useWatch` to observe changes on a set of inputs, and then re-execute the `watchFn` when
 * those inputs change.
 *
 * The `watchFn` only executes if the observed inputs change. To observe the inputs, use the
 * `obs` function to wrap property reads. This creates subscriptions that will trigger the
 * `watchFn` to rerun.
 *
 * @see `Tracker`
 *
 * @public
 *
 * ### Example
 *
 * The `useWatch` function is used to observe the `state.count` property. Any changes to the
 * `state.count` cause the `watchFn` to execute which in turn updates the `state.doubleCount` to
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
 *   useWatch$(({ track }) => {
 *     const count = track(() => store.count);
 *     store.doubleCount = 2 * count;
 *   });
 *
 *   // Debouncer watch
 *   useWatch$(({ track }) => {
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
export const useWatch$ = /*#__PURE__*/ implicit$FirstArg(useWatchQrl);

// <docs markdown="../readme.md#useClientEffect">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useClientEffect instead)
/**
 * ```tsx
 * const Timer = component$(() => {
 *   const store = useStore({
 *     count: 0,
 *   });
 *
 *   useClientEffect$(() => {
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
export const useClientEffectQrl = (qrl: QRL<WatchFn>, opts?: UseEffectOptions): void => {
  const { get, set, i, ctx } = useSequentialScope<Watch>();
  const eagerness = opts?.eagerness ?? 'visible';
  if (get) {
    if (isServer()) {
      useRunWatch(get, eagerness);
    }
    return;
  }
  assertQrl(qrl);
  const el = ctx.$hostElement$;
  const watch = new Watch(WatchFlagsIsEffect, i, el, qrl, undefined);
  const elCtx = getContext(el);
  const containerState = ctx.$renderCtx$.$static$.$containerState$;
  if (!elCtx.$watches$) {
    elCtx.$watches$ = [];
  }
  elCtx.$watches$.push(watch);
  set(watch);
  useRunWatch(watch, eagerness);
  if (!isServer()) {
    qrl.$resolveLazy$(containerState.$containerEl$);
    notifyWatch(watch, containerState);
  }
};

// <docs markdown="../readme.md#useClientEffect">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useClientEffect instead)
/**
 * ```tsx
 * const Timer = component$(() => {
 *   const store = useStore({
 *     count: 0,
 *   });
 *
 *   useClientEffect$(() => {
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
export const useClientEffect$ = /*#__PURE__*/ implicit$FirstArg(useClientEffectQrl);

// <docs markdown="../readme.md#useServerMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useServerMount instead)
/**
 * Register's a server mount hook that runs only in the server when the component is first
 * mounted.
 *
 * ### Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     users: [],
 *   });
 *
 *   useServerMount$(async () => {
 *     // This code will ONLY run once in the server, when the component is mounted
 *     store.users = await db.requestUsers();
 *   });
 *
 *   return (
 *     <div>
 *       {store.users.map((user) => (
 *         <User user={user} />
 *       ))}
 *     </div>
 *   );
 * });
 *
 * interface User {
 *   name: string;
 * }
 * function User(props: { user: User }) {
 *   return <div>Name: {props.user.name}</div>;
 * }
 * ```
 *
 * @see `useMount`
 * @public
 */
// </docs>
export const useServerMountQrl = <T>(mountQrl: QRL<MountFn<T>>): void => {
  const { get, set, ctx } = useSequentialScope<boolean>();
  if (get) {
    return;
  }

  if (isServer()) {
    waitAndRun(ctx, mountQrl);
    set(true);
  } else {
    throw qError(QError_canNotMountUseServerMount, ctx.$hostElement$);
  }
};

// <docs markdown="../readme.md#useServerMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useServerMount instead)
/**
 * Register's a server mount hook that runs only in the server when the component is first
 * mounted.
 *
 * ### Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     users: [],
 *   });
 *
 *   useServerMount$(async () => {
 *     // This code will ONLY run once in the server, when the component is mounted
 *     store.users = await db.requestUsers();
 *   });
 *
 *   return (
 *     <div>
 *       {store.users.map((user) => (
 *         <User user={user} />
 *       ))}
 *     </div>
 *   );
 * });
 *
 * interface User {
 *   name: string;
 * }
 * function User(props: { user: User }) {
 *   return <div>Name: {props.user.name}</div>;
 * }
 * ```
 *
 * @see `useMount`
 * @public
 */
// </docs>
export const useServerMount$ = /*#__PURE__*/ implicit$FirstArg(useServerMountQrl);

// <docs markdown="../readme.md#useMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useMount instead)
/**
 * Register a server mount hook that runs only in the server when the component is first mounted.
 *
 * ### Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     temp: 0,
 *   });
 *
 *   useMount$(async () => {
 *     // This code will run once whenever a component is mounted in the server, or in the client
 *     const res = await fetch('weather-api.example');
 *     const json = (await res.json()) as any;
 *     store.temp = json.temp;
 *   });
 *
 *   return (
 *     <div>
 *       <p>The temperature is: ${store.temp}</p>
 *     </div>
 *   );
 * });
 * ```
 *
 * @see `useServerMount`
 * @public
 */
// </docs>
export const useMountQrl = <T>(mountQrl: QRL<MountFn<T>>): void => {
  const { get, set, ctx } = useSequentialScope<boolean>();
  if (get) {
    return;
  }
  assertQrl(mountQrl);
  mountQrl.$resolveLazy$(ctx.$renderCtx$.$static$.$containerState$.$containerEl$);
  waitAndRun(ctx, mountQrl);
  set(true);
};

// <docs markdown="../readme.md#useMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useMount instead)
/**
 * Register a server mount hook that runs only in the server when the component is first mounted.
 *
 * ### Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     temp: 0,
 *   });
 *
 *   useMount$(async () => {
 *     // This code will run once whenever a component is mounted in the server, or in the client
 *     const res = await fetch('weather-api.example');
 *     const json = (await res.json()) as any;
 *     store.temp = json.temp;
 *   });
 *
 *   return (
 *     <div>
 *       <p>The temperature is: ${store.temp}</p>
 *     </div>
 *   );
 * });
 * ```
 *
 * @see `useServerMount`
 * @public
 */
// </docs>
export const useMount$ = /*#__PURE__*/ implicit$FirstArg(useMountQrl);

export type WatchDescriptor = DescriptorBase<WatchFn>;

export interface ResourceDescriptor<T>
  extends DescriptorBase<ResourceFn<T>, ResourceReturnInternal<T>> {}

export type SubscriberHost = QwikElement;

export type SubscriberEffect = WatchDescriptor | ResourceDescriptor<any>;

export const isResourceWatch = (watch: SubscriberEffect): watch is ResourceDescriptor<any> => {
  return !!watch.$resource$;
};

export const runSubscriber = async (
  watch: SubscriberEffect,
  containerState: ContainerState,
  rctx?: RenderContext
) => {
  assertEqual(!!(watch.$flags$ & WatchFlagsIsDirty), true, 'Resource is not dirty', watch);
  if (isResourceWatch(watch)) {
    return runResource(watch, containerState);
  } else {
    return runWatch(watch, containerState, rctx);
  }
};

export const runResource = <T>(
  watch: ResourceDescriptor<T>,
  containerState: ContainerState,
  waitOn?: Promise<any>
): ValueOrPromise<void> => {
  watch.$flags$ &= ~WatchFlagsIsDirty;
  cleanupWatch(watch);

  const el = watch.$el$;
  const invokationContext = newInvokeContext(el, undefined, 'WatchEvent');
  const { $subsManager$: subsManager } = containerState;
  watch.$qrl$.$captureRef$;
  const watchFn = watch.$qrl$.getFn(invokationContext, () => {
    subsManager.$clearSub$(watch);
  });

  const cleanups: (() => void)[] = [];
  const resource = watch.$resource$;
  assertDefined(
    resource,
    'useResource: when running a resource, "watch.r" must be a defined.',
    watch
  );

  const track: Tracker = (obj: any, prop?: string) => {
    if (isFunction(obj)) {
      const ctx = newInvokeContext();
      ctx.$subscriber$ = watch;
      return invoke(ctx, obj);
    }
    const manager = getProxyManager(obj);
    if (manager) {
      manager.$addSub$([0, watch, prop]);
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
        resource._resolved = undefined;
        resource._error = value;
        reject(value);
      }
      return true;
    }
    return false;
  };

  // Execute mutation inside empty invokation
  invoke(invokationContext, () => {
    resource._state = 'pending';
    resource.loading = !isServer();
    resource._resolved = undefined as any;
    resource.promise = new Promise((r, re) => {
      resolve = r;
      reject = re;
    });
  });

  watch.$destroy$ = noSerialize(() => {
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
  watch: WatchDescriptor,
  containerState: ContainerState,
  rctx?: RenderContext
): ValueOrPromise<void> => {
  watch.$flags$ &= ~WatchFlagsIsDirty;

  cleanupWatch(watch);
  const hostElement = watch.$el$;
  const invokationContext = newInvokeContext(hostElement, undefined, 'WatchEvent');
  const { $subsManager$: subsManager } = containerState;
  const watchFn = watch.$qrl$.getFn(invokationContext, () => {
    subsManager.$clearSub$(watch);
  }) as WatchFn;
  const track: Tracker = (obj: any, prop?: string) => {
    if (isFunction(obj)) {
      const ctx = newInvokeContext();
      ctx.$subscriber$ = watch;
      return invoke(ctx, obj);
    }
    const manager = getProxyManager(obj);
    if (manager) {
      manager.$addSub$([0, watch, prop]);
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

  const opts: WatchCtx = {
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
      handleError(reason, hostElement, rctx);
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

const useRunWatch = (watch: SubscriberEffect, eagerness: EagernessOptions | undefined) => {
  if (eagerness === 'visible') {
    useOn('qvisible', getWatchHandlerQrl(watch));
  } else if (eagerness === 'load') {
    useOnDocument('qinit', getWatchHandlerQrl(watch));
  } else if (eagerness === 'idle') {
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
  return isObject(obj) && obj instanceof Watch;
};

export const serializeWatch = (watch: SubscriberEffect, getObjId: MustGetObjID) => {
  let value = `${intToStr(watch.$flags$)} ${intToStr(watch.$index$)} ${getObjId(
    watch.$qrl$
  )} ${getObjId(watch.$el$)}`;
  if (isResourceWatch(watch)) {
    value += ` ${getObjId(watch.$resource$)}`;
  }
  return value;
};

export const parseWatch = (data: string) => {
  const [flags, index, qrl, el, resource] = data.split(' ');
  return new Watch(strToInt(flags), strToInt(index), el as any, qrl as any, resource as any);
};

export class Watch implements DescriptorBase<any, any> {
  constructor(
    public $flags$: number,
    public $index$: number,
    public $el$: QwikElement,
    public $qrl$: QRLInternal<any>,
    public $resource$: ResourceReturnInternal<any> | undefined
  ) {}
}
