import { getProxyTarget, noSerialize, NoSerialize } from '../object/q-object';
import { getContext } from '../props/props';
import { newInvokeContext } from './use-core';
import { logDebug, logError } from '../util/log';
import { then } from '../util/promises';
import { useSequentialScope } from './use-store.public';
import { getDocument } from '../util/dom';
import { isFunction, isObject, ValueOrPromise } from '../util/types';
import { getPlatform } from '../platform/platform';
import { useDocument } from './use-document.public';
import { ContainerState, handleWatch } from '../render/notify-render';
import { useResumeQrl, useVisibleQrl } from './use-on';
import { implicit$FirstArg } from '../util/implicit_dollar';
import { assertDefined } from '../assert/assert';
import type { QRL } from '../import/qrl.public';
import { assertQrl, createQrl, QRLInternal } from '../import/qrl-class';

export const WatchFlagsIsEffect = 1 << 0;
export const WatchFlagsIsWatch = 1 << 1;
export const WatchFlagsIsDirty = 1 << 2;
export const WatchFlagsIsCleanup = 1 << 3;

/**
 * @alpha
 */
export type WatchFn = (track: Tracker) => ValueOrPromise<void | (() => void)>;

/**
 * @alpha
 */
export type ServerFn = () => ValueOrPromise<void | (() => void)>;

/**
 * @alpha
 */
export interface WatchDescriptor {
  qrl: QRLInternal<WatchFn>;
  el: Element;
  f: number;
  i: number;
  destroy?: NoSerialize<() => void>;
  running?: NoSerialize<Promise<WatchDescriptor>>;
}

export const isWatchDescriptor = (obj: any): obj is WatchDescriptor => {
  return isObject(obj) && 'qrl' in obj && 'f' in obj;
};

export const isWatchCleanup = (obj: any): obj is WatchDescriptor => {
  return isWatchDescriptor(obj) && !!(obj.f & WatchFlagsIsCleanup);
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
    ctx.$waitOn$.push(Promise.resolve().then(() => runWatch(watch, containerState)));
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
 * @see `useClientMount` `useMount`
 * @public
 */
// </docs>
export const useServerMountQrl = (mountQrl: QRL<ServerFn>): void => {
  const { get, set, ctx } = useSequentialScope<boolean>();
  if (!get) {
    set(true);
    const isServer = getPlatform(ctx.$doc$).isServer;
    if (isServer) {
      ctx.$waitOn$.push(mountQrl());
    }
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
 * @see `useClientMount` `useMount`
 * @public
 */
// </docs>
export const useServerMount$ = /*#__PURE__*/ implicit$FirstArg(useServerMountQrl);

// <docs markdown="../readme.md#useClientMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useClientMount instead)
/**
 * Register's a client mount hook that runs only in the client when the component is first
 * mounted.
 *
 * ## Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     hash: '',
 *   });
 *
 *   useClientMount$(async () => {
 *     // This code will ONLY run once in the client, when the component is mounted
 *     store.hash = document.location.hash;
 *   });
 *
 *   return (
 *     <Host>
 *       <p>The url hash is: ${store.hash}</p>
 *     </Host>
 *   );
 * });
 * ```
 *
 * @see `useServerMount` `useMount`
 *
 * @public
 */
// </docs>
export const useClientMountQrl = (mountQrl: QRL<ServerFn>): void => {
  const { get, set, ctx } = useSequentialScope<boolean>();
  if (!get) {
    set(true);
    const isServer = getPlatform(useDocument()).isServer;
    if (!isServer) {
      ctx.$waitOn$.push(mountQrl());
    }
  }
};

// <docs markdown="../readme.md#useClientMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useClientMount instead)
/**
 * Register's a client mount hook that runs only in the client when the component is first
 * mounted.
 *
 * ## Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     hash: '',
 *   });
 *
 *   useClientMount$(async () => {
 *     // This code will ONLY run once in the client, when the component is mounted
 *     store.hash = document.location.hash;
 *   });
 *
 *   return (
 *     <Host>
 *       <p>The url hash is: ${store.hash}</p>
 *     </Host>
 *   );
 * });
 * ```
 *
 * @see `useServerMount` `useMount`
 *
 * @public
 */
// </docs>
export const useClientMount$ = /*#__PURE__*/ implicit$FirstArg(useClientMountQrl);

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
 * @see `useServerMount` `useClientMount`
 * @public
 */
// </docs>
export const useMountQrl = (mountQrl: QRL<ServerFn>): void => {
  const { get, set, ctx } = useSequentialScope<boolean>();
  if (!get) {
    set(true);
    ctx.$waitOn$.push(mountQrl());
  }
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
 * @see `useServerMount` `useClientMount`
 * @public
 */
// </docs>
export const useMount$ = /*#__PURE__*/ implicit$FirstArg(useMountQrl);

export const runWatch = (
  watch: WatchDescriptor,
  containerState: ContainerState
): Promise<WatchDescriptor> => {
  if (!(watch.f & WatchFlagsIsDirty)) {
    logDebug('Watch is not dirty, skipping run', watch);
    return Promise.resolve(watch);
  }
  watch.f &= ~WatchFlagsIsDirty;
  const promise = new Promise<WatchDescriptor>((resolve) => {
    then(watch.running, () => {
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

      return then(watchFn(track), (returnValue) => {
        if (isFunction(returnValue)) {
          watch.destroy = noSerialize(returnValue);
        }
        resolve(watch);
      });
    });
  });
  watch.running = noSerialize(promise);
  return promise;
};

export const cleanupWatch = (watch: WatchDescriptor) => {
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

export const destroyWatch = (watch: WatchDescriptor) => {
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

const useRunWatch = (watch: WatchDescriptor, run: UseEffectRunOptions | undefined) => {
  if (run === 'load') {
    useResumeQrl(getWatchHandlerQrl(watch));
  } else if (run === 'visible') {
    useVisibleQrl(getWatchHandlerQrl(watch));
  }
};

const getWatchHandlerQrl = (watch: WatchDescriptor) => {
  const watchQrl = watch.qrl;
  assertQrl(watchQrl);

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
