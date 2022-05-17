import {
  noSerialize,
  NoSerialize,
  notifyWatch,
  QOjectAllSymbol,
  removeSub,
  SetSubscriber,
} from '../object/q-object';
import { implicit$FirstArg, QRL } from '../import/qrl.public';
import { getContext } from '../props/props';
import { newInvokeContext, useWaitOn } from '../use/use-core';
import { useHostElement } from '../use/use-host-element.public';
import { logDebug, logError } from '../util/log';
import { then } from '../util/promises';
import { useSequentialScope } from '../use/use-store.public';
import { QRLInternal } from '../import/qrl-class';
import { getDocument } from '../util/dom';
import type { ValueOrPromise } from '../util/types';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { getPlatform } from '../platform/platform';
import { useDocument } from '../use/use-document.public';
import { useResumeQrl, useVisibleQrl } from '../component/component.public';

export const enum WatchFlags {
  IsDirty = 1 << 0,
  IsCleanup = 1 << 1,
}

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
  qrl: QRL<WatchFn>;
  el: Element;
  f: number;
  destroy?: NoSerialize<() => void>;
  running?: NoSerialize<Promise<WatchDescriptor>>;
}

export const isWatchDescriptor = (obj: any): obj is WatchDescriptor => {
  return obj && typeof obj === 'object' && 'qrl' in obj && 'f' in obj;
};

export const isWatchCleanup = (obj: any): obj is WatchDescriptor => {
  return isWatchDescriptor(obj) && !!(obj.f & WatchFlags.IsCleanup);
};

/**
 * @alpha
 */
export type UseEffectRunOptions = 'visible' | 'load';

/**
 * @alpha
 */
export interface UseEffectOptions {
  run?: UseEffectRunOptions;
}

/**
 * @alpha
 */
export function handleWatch() {
  const [watch] = useLexicalScope();
  notifyWatch(watch);
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
 * The `watchFn` only executes if the observed inputs change. To observe the inputs use the `obs`
 * function to wrap property reads. This creates subscriptions which will trigger the `watchFn`
 * to re-run.
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
export function useWatchQrl(qrl: QRL<WatchFn>, opts?: UseEffectOptions): void {
  const [watch, setWatch] = useSequentialScope();
  if (!watch) {
    const el = useHostElement();
    const watch: WatchDescriptor = {
      qrl,
      el,
      f: WatchFlags.IsDirty,
    };
    setWatch(watch);
    getContext(el).refMap.add(watch);
    useWaitOn(Promise.resolve().then(() => runWatch(watch)));
    const isServer = getPlatform(useDocument()).isServer;
    if (isServer) {
      useRunWatch(watch, opts?.run);
    }
  }
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
 * The `watchFn` only executes if the observed inputs change. To observe the inputs use the `obs`
 * function to wrap property reads. This creates subscriptions which will trigger the `watchFn`
 * to re-run.
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
export const useWatch$ = implicit$FirstArg(useWatchQrl);

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
export function useClientEffectQrl(qrl: QRL<WatchFn>, opts?: UseEffectOptions): void {
  const [watch, setWatch] = useSequentialScope();
  if (!watch) {
    const el = useHostElement();
    const watch: WatchDescriptor = {
      qrl,
      el,
      f: 0,
    };
    setWatch(watch);
    getContext(el).refMap.add(watch);
    useRunWatch(watch, opts?.run ?? 'visible');
    const doc = useDocument() as any;
    if (doc['qO']) {
      doc['qO'].observe(el);
    }
  }
}

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
export const useClientEffect$ = implicit$FirstArg(useClientEffectQrl);

// <docs markdown="../readme.md#useServerMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useServerMount instead)
/**
 * Register's a server mount hook, that runs only in server when the component is first mounted.
 * `useWatch` will run once in the server, and N-times in the client, only when the **tracked**
 * state changes.
 *
 * ## Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     users: [],
 *   });
 *
 *   // Double count watch
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
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     users: [],
 *   });
 *
 *   // Double count watch
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
 * @public
 */
// </docs>
export function useServerMountQrl(watchQrl: QRL<ServerFn>): void {
  const [watch, setWatch] = useSequentialScope();
  if (!watch) {
    setWatch(true);
    const isServer = getPlatform(useDocument()).isServer;
    if (isServer) {
      useWaitOn(watchQrl.invoke());
    }
  }
}

// <docs markdown="../readme.md#useServerMount">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useServerMount instead)
/**
 * Register's a server mount hook, that runs only in server when the component is first mounted.
 * `useWatch` will run once in the server, and N-times in the client, only when the **tracked**
 * state changes.
 *
 * ## Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     users: [],
 *   });
 *
 *   // Double count watch
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
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     users: [],
 *   });
 *
 *   // Double count watch
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
 * @public
 */
// </docs>
export const useServerMount$ = implicit$FirstArg(useServerMountQrl);

export function runWatch(watch: WatchDescriptor): Promise<WatchDescriptor> {
  if (!(watch.f & WatchFlags.IsDirty)) {
    logDebug('Watch is not dirty, skipping run', watch);
    return Promise.resolve(watch);
  }
  watch.f &= ~WatchFlags.IsDirty;
  const promise = new Promise<WatchDescriptor>((resolve) => {
    then(watch.running, () => {
      cleanupWatch(watch);
      const el = watch.el;
      const invokationContext = newInvokeContext(getDocument(el), el, el, 'WatchEvent');
      const watchFn = watch.qrl.invokeFn(el, invokationContext, () => {
        const captureRef = (watch.qrl as QRLInternal).captureRef;
        if (Array.isArray(captureRef)) {
          captureRef.forEach((obj) => {
            removeSub(obj, watch);
          });
        }
      });
      const tracker: Tracker = (obj: any, prop?: string) => {
        obj[SetSubscriber] = watch;
        if (prop) {
          return obj[prop];
        } else {
          return obj[QOjectAllSymbol];
        }
      };

      return then(watchFn(tracker), (returnValue) => {
        if (typeof returnValue === 'function') {
          watch.destroy = noSerialize(returnValue);
        }
        resolve(watch);
      });
    });
  });
  watch.running = noSerialize(promise);
  return promise;
}

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
  if (watch.f & WatchFlags.IsCleanup) {
    watch.f &= ~WatchFlags.IsCleanup;
    const cleanup = watch.qrl.invokeFn(watch.el);
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
 * changes. A change to any of the properties cause the `watchFn` to re-run.
 *
 * ## Example
 *
 * The `obs` passed into the `watchFn` is used to mark `state.count` as a property of interest.
 * Any changes to the `state.count` property will cause the `watchFn` to re-run.
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
  const watchQrl = watch.qrl as QRLInternal;
  const watchHandler = new QRLInternal(
    (watchQrl as QRLInternal).chunk,
    'handleWatch',
    handleWatch,
    null,
    null,
    [watch]
  );
  watchHandler.refSymbol = (watchQrl as QRLInternal).symbol;
  return watchHandler;
};
