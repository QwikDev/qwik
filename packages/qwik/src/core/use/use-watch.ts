import { getProxyTarget, noSerialize, NoSerialize } from '../object/q-object';
import { getContext } from '../props/props';
import { newInvokeContext, useInvoke } from './use-core';
import { logError } from '../util/log';
import { safeCall, then } from '../util/promises';
import { useSequentialScope } from './use-store.public';
import { getDocument } from '../util/dom';
import { isFunction, isObject, ValueOrPromise } from '../util/types';
import { getPlatform } from '../platform/platform';
import { ContainerState, handleWatch } from '../render/notify-render';
import { useResumeQrl, useVisibleQrl } from './use-on';
import { implicit$FirstArg } from '../util/implicit_dollar';
import { assertDefined, assertEqual } from '../assert/assert';
import type { QRL } from '../import/qrl.public';
import { assertQrl, createQrl, QRLInternal } from '../import/qrl-class';
import { qError, QError_canNotMountUseServerMount } from '../error/error';

export const WatchFlagsIsEffect = 1 << 0;
export const WatchFlagsIsWatch = 1 << 1;
export const WatchFlagsIsDirty = 1 << 2;
export const WatchFlagsIsCleanup = 1 << 3;
export const WatchFlagsIsResource = 1 << 4;
export const WatchFlagsIsBeforeRender = WatchFlagsIsResource | WatchFlagsIsWatch;

/**
 * @alpha
 */
export type WatchFn = (track: Tracker) => ValueOrPromise<void | (() => void)>;

/**
 * @alpha
 */
export interface ResourceCtx<T> {
  track: Tracker;
  cleanup(callback: () => void): void;
  previous: T | undefined;
}

/**
 * @alpha
 */
export type MountFn<T> = () => ValueOrPromise<T>;

/**
 * @alpha
 */
export type Resource<T> = ResourcePending<T> | ResourceResolved<T> | ResourceRejected<T>;

/**
 * @alpha
 */
export interface ResourcePending<T> {
  state: 'pending';

  promise: Promise<T>;
  resolved: undefined;
  error: undefined;
}

/**
 * @alpha
 */
export interface ResourceResolved<T> {
  state: 'resolved';

  promise: Promise<T>;
  resolved: T;
  error: undefined;
}

/**
 * @alpha
 */
export interface ResourceRejected<T> {
  state: 'rejected';

  promise: Promise<T>;
  resolved: undefined;
  error: NoSerialize<any>;
}

/**
 * @alpha
 */
export type ResourceFn<T> = (ctx: ResourceCtx<T>) => ValueOrPromise<T>;

/**
 * @alpha
 */
export interface DescriptorBase<T = any> {
  qrl: QRLInternal<T>;
  el: Element;
  f: number;
  i: number;
  destroy?: NoSerialize<() => void>;
}

/**
 * @alpha
 */
export type WatchDescriptor = DescriptorBase<WatchFn>;

/**
 * @alpha
 */
export interface ResourceDescriptor<T> extends DescriptorBase<ResourceFn<T>> {
  r: Resource<T>;
}

/**
 * @alpha
 */
export type SubscriberDescriptor = WatchDescriptor | ResourceDescriptor<any>;

export const isSubscriberDescriptor = (obj: any): obj is SubscriberDescriptor => {
  return isObject(obj) && 'qrl' in obj && 'f' in obj;
};

export const isWatchCleanup = (obj: any): obj is WatchDescriptor => {
  return isSubscriberDescriptor(obj) && !!(obj.f & WatchFlagsIsCleanup);
};

/**
 * @alpha
 */
export type UseEffectRunOptions = 'visible' | 'load';

/**
 * @alpha
 */
export interface UseEffectOptions {
  /**
   * - `visible`: run the effect when the element is visible.
   * - `load`: eagerly run the effect when the application resumes.
   */
  run?: UseEffectRunOptions;
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
 * ## Example
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
 *   useWatch$((track) => {
 *     const count = track(store, 'count');
 *     store.doubleCount = 2 * count;
 *   });
 *
 *   // Debouncer watch
 *   useWatch$((track) => {
 *     const doubleCount = track(store, 'doubleCount');
 *     const timer = setTimeout(() => {
 *       store.debounced = doubleCount;
 *     }, 2000);
 *     return () => {
 *       clearTimeout(timer);
 *     };
 *   });
 *   return (
 *     <Host>
 *       <div>
 *         {store.count} / {store.doubleCount}
 *       </div>
 *       <div>{store.debounced}</div>
 *     </Host>
 *   );
 * });
 * ```
 *
 * @param watch - Function which should be re-executed when changes to the inputs are detected
 * @public
 */
// </docs>
export const useWatchQrl = (qrl: QRL<WatchFn>, opts?: UseEffectOptions): void => {
  const { get, set, ctx, i } = useSequentialScope<boolean>();
  if (!get) {
    assertQrl(qrl);
    const el = ctx.$hostElement$;
    const containerState = ctx.$renderCtx$.$containerState$;
    const watch: WatchDescriptor = {
      qrl,
      el,
      f: WatchFlagsIsDirty | WatchFlagsIsWatch,
      i,
    };
    set(true);
    getContext(el).$watches$.push(watch);
    const previousWait = ctx.$waitOn$.slice();
    ctx.$waitOn$.push(Promise.all(previousWait).then(() => runSubscriber(watch, containerState)));
    const isServer = containerState.$platform$.isServer;
    if (isServer) {
      useRunWatch(watch, opts?.run);
    }
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
 * ## Example
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
 *   useWatch$((track) => {
 *     const count = track(store, 'count');
 *     store.doubleCount = 2 * count;
 *   });
 *
 *   // Debouncer watch
 *   useWatch$((track) => {
 *     const doubleCount = track(store, 'doubleCount');
 *     const timer = setTimeout(() => {
 *       store.debounced = doubleCount;
 *     }, 2000);
 *     return () => {
 *       clearTimeout(timer);
 *     };
 *   });
 *   return (
 *     <Host>
 *       <div>
 *         {store.count} / {store.doubleCount}
 *       </div>
 *       <div>{store.debounced}</div>
 *     </Host>
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
 *   return <Host>{store.count}</Host>;
 * });
 * ```
 *
 * @public
 */
// </docs>
export const useClientEffectQrl = (qrl: QRL<WatchFn>, opts?: UseEffectOptions): void => {
  const { get, set, i, ctx } = useSequentialScope<boolean>();
  if (!get) {
    assertQrl(qrl);
    const el = ctx.$hostElement$;
    const watch: WatchDescriptor = {
      qrl,
      el,
      f: WatchFlagsIsEffect,
      i,
    };
    set(true);
    getContext(el).$watches$.push(watch);
    useRunWatch(watch, opts?.run ?? 'visible');
    const doc = ctx.$doc$ as any;
    if (doc['qO']) {
      doc['qO'].observe(el);
    }
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
 *   return <Host>{store.count}</Host>;
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
 * ## Example
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
 *     <Host>
 *       {store.users.map((user) => (
 *         <User user={user} />
 *       ))}
 *     </Host>
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
export const useServerMountQrl = <T>(mountQrl: QRL<MountFn<T>>): Resource<T> => {
  const { get, set, ctx } = useSequentialScope<Resource<T>>();
  if (get) {
    return get;
  }
  const isServer = getPlatform(ctx.$doc$).isServer;
  if (isServer) {
    const resource = createResourceFromPromise(mountQrl());
    ctx.$waitOn$.push(resource.promise);
    set(resource);
    return resource;
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
 * ## Example
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
 *     <Host>
 *       {store.users.map((user) => (
 *         <User user={user} />
 *       ))}
 *     </Host>
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
 * ## Example
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
 *     <Host>
 *       <p>The temperature is: ${store.temp}</p>
 *     </Host>
 *   );
 * });
 * ```
 *
 * @see `useServerMount`
 * @public
 */
// </docs>
export const useMountQrl = <T>(mountQrl: QRL<MountFn<T>>): Resource<T> => {
  const { get, set, ctx } = useSequentialScope<Resource<T>>();
  if (get) {
    return get;
  }
  const resource = createResourceFromPromise(mountQrl());
  ctx.$waitOn$.push(resource.promise);
  set(resource);
  return resource;
};

const createResourceFromPromise = <T>(promise: Promise<T>): Resource<T> => {
  const resource: Resource<T> = {
    state: 'pending',
    error: undefined,
    resolved: undefined,
    promise: promise.then(
      (value) => {
        resource.state = 'resolved';
        resource.resolved = value as any;
        return value;
      },
      (reason) => {
        resource.state = 'rejected';
        resource.error = reason;
        throw reason;
      }
    ),
  };
  return resource;
};

// <docs markdown="../readme.md#useMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useMount instead)
/**
 * Register a server mount hook that runs only in the server when the component is first mounted.
 *
 * ## Example
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
 *     <Host>
 *       <p>The temperature is: ${store.temp}</p>
 *     </Host>
 *   );
 * });
 * ```
 *
 * @see `useServerMount`
 * @public
 */
// </docs>
export const useMount$ = /*#__PURE__*/ implicit$FirstArg(useMountQrl);

export const runSubscriber = async (
  watch: SubscriberDescriptor,
  containerState: ContainerState
) => {
  assertEqual(!!(watch.f & WatchFlagsIsDirty), true, 'Resource is not dirty');
  if ('r' in watch) {
    await runResource(watch, containerState);
  } else {
    await runWatch(watch, containerState);
  }
};

export const runResource = <T>(
  watch: ResourceDescriptor<T>,
  containerState: ContainerState,
  waitOn?: Promise<any>
): ValueOrPromise<void> => {
  watch.f &= ~WatchFlagsIsDirty;
  cleanupWatch(watch);

  const el = watch.el;
  const doc = getDocument(el);
  const invokationContext = newInvokeContext(doc, el, el, 'WatchEvent');
  const { $subsManager$: subsManager } = containerState;
  const watchFn = watch.qrl.$invokeFn$(el, invokationContext, () => {
    subsManager.$clearSub$(watch);
  });

  const cleanups: (() => void)[] = [];
  const resource = watch.r;
  assertDefined(resource, 'useResource: when running a resource, "watch.r" must be a defined.');

  const track: Tracker = (obj: any, prop?: string) => {
    const target = getProxyTarget(obj);
    assertDefined(target, 'Expected a Proxy object to track');
    const manager = subsManager.$getLocal$(target);
    manager.$addSub$(watch, prop);
    if (prop) {
      return obj[prop];
    } else {
      return obj;
    }
  };
  const opts: ResourceCtx<T> = {
    track,
    cleanup(callback) {
      cleanups.push(callback);
    },
    previous: resource.resolved,
  };

  let resolve: (v: T) => void;
  let reject: (v: any) => void;

  // Execute mutation inside empty invokation
  useInvoke(invokationContext, () => {
    resource.state = 'pending';
    resource.resolved = undefined as any;
    resource.promise = new Promise((r, re) => {
      resolve = r;
      reject = re;
    });
  });

  watch.destroy = noSerialize(() => {
    cleanups.forEach((fn) => fn());
    reject('cancelled');
  });

  return safeCall(
    () => then(waitOn, () => watchFn(opts)),
    (value) => {
      resource.state = 'resolved';
      resource.resolved = value;
      resource.error = undefined;
      resolve(value);
      return;
    },
    (reason) => {
      resource.state = 'rejected';
      resource.resolved = undefined as any;
      resource.error = noSerialize(reason);
      reject(reason);
      return;
    }
  );
};

export const runWatch = (
  watch: WatchDescriptor,
  containerState: ContainerState
): ValueOrPromise<void> => {
  watch.f &= ~WatchFlagsIsDirty;

  cleanupWatch(watch);
  const el = watch.el;
  const doc = getDocument(el);
  const invokationContext = newInvokeContext(doc, el, el, 'WatchEvent');
  const { $subsManager$: subsManager } = containerState;
  const watchFn = watch.qrl.$invokeFn$(el, invokationContext, () => {
    subsManager.$clearSub$(watch);
  });
  const track: Tracker = (obj: any, prop?: string) => {
    const target = getProxyTarget(obj);
    assertDefined(target, 'Expected a Proxy object to track');
    const manager = subsManager.$getLocal$(target);
    manager.$addSub$(watch, prop);
    if (prop) {
      return obj[prop];
    } else {
      return obj;
    }
  };

  return safeCall(
    () => watchFn(track),
    (returnValue) => {
      if (isFunction(returnValue)) {
        watch.destroy = noSerialize(returnValue);
      }
    },
    (reason) => {
      logError(reason);
    }
  );
};

export const cleanupWatch = (watch: SubscriberDescriptor) => {
  const destroy = watch.destroy;
  if (destroy) {
    watch.destroy = undefined;
    try {
      destroy();
    } catch (err) {
      logError(err);
    }
  }
};

export const destroyWatch = (watch: SubscriberDescriptor) => {
  if (watch.f & WatchFlagsIsCleanup) {
    watch.f &= ~WatchFlagsIsCleanup;
    const cleanup = watch.qrl.$invokeFn$(watch.el);
    (cleanup as any)();
  } else {
    cleanupWatch(watch);
  }
};

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
 * ## Example
 *
 * The `obs` passed into the `watchFn` is used to mark `state.count` as a property of interest.
 * Any changes to the `state.count` property will cause the `watchFn` to rerun.
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({ count: 0, doubleCount: 0 });
 *   useWatch$((track) => {
 *     const count = track(store, 'count');
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
  <T extends {}>(obj: T): T;
  <T extends {}, B extends keyof T>(obj: T, prop: B): T[B];
}

const useRunWatch = (watch: SubscriberDescriptor, run: UseEffectRunOptions | undefined) => {
  if (run === 'load') {
    useResumeQrl(getWatchHandlerQrl(watch));
  } else if (run === 'visible') {
    useVisibleQrl(getWatchHandlerQrl(watch));
  }
};

const getWatchHandlerQrl = (watch: SubscriberDescriptor) => {
  const watchQrl = watch.qrl;
  const watchHandler = createQrl(
    watchQrl.$chunk$,
    'handleWatch',
    handleWatch,
    null,
    null,
    [watch],
    watchQrl.$symbol$
  );
  return watchHandler;
};
