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
  IsConnected = 1 << 0,
  IsDirty = 1 << 1,
}

/**
 * @alpha
 */
export type WatchFn = (track: Tracker) => ValueOrPromise<void | (() => void)>;

/**
 * @alpha
 */
export type ServerFn = () => ValueOrPromise<void | (() => void)>;

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

/**
 * @alpha
 */
export function useWatchQrl(qrl: QRL<WatchFn>, opts?: UseEffectOptions): void {
  const [watch, setWatch] = useSequentialScope();
  if (!watch) {
    const el = useHostElement();
    const watch: WatchDescriptor = {
      qrl,
      el,
      f: WatchFlags.IsConnected | WatchFlags.IsDirty,
    };
    setWatch(watch);
    getContext(el).refMap.add(watch);
    useWaitOn(runWatch(watch));
    const isServer = getPlatform(useDocument()).isServer;
    if (isServer) {
      useRunWatch(watch, opts?.run);
    }
  }
}

/**
 * @alpha
 */
export const useWatch$ = implicit$FirstArg(useWatchQrl);

/**
 * @alpha
 */
export function useClientEffectQrl(qrl: QRL<WatchFn>, opts?: UseEffectOptions): void {
  const [watch, setWatch] = useSequentialScope();
  if (!watch) {
    const el = useHostElement();
    const watch: WatchDescriptor = {
      qrl,
      el,
      f: WatchFlags.IsConnected,
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

/**
 * @alpha
 */
export const useClientEffect$ = implicit$FirstArg(useClientEffectQrl);

/**
 * @alpha
 */
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

/**
 * @alpha
 */
export const useServerMount$ = implicit$FirstArg(useServerMountQrl);

export function runWatch(watch: WatchDescriptor): Promise<WatchDescriptor> {
  if (!(watch.f & WatchFlags.IsDirty)) {
    logDebug('Watch is not dirty, skipping run', watch);
    return Promise.resolve(watch);
  }
  watch.f &= ~WatchFlags.IsDirty;
  const promise = new Promise<WatchDescriptor>((resolve) => {
    then(watch.running, () => {
      const destroy = watch.destroy;
      if (destroy) {
        watch.destroy = undefined;
        try {
          destroy();
        } catch (err) {
          logError(err);
        }
      }
      const el = watch.el;
      const invokationContext = newInvokeContext(getDocument(el), el, el, 'WatchEvent');
      invokationContext.watch = watch;

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

// <docs markdown="./watch.public.md#Tracker">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./watch.public.md#Tracker instead)
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
 * ```typescript
 * export const MyComp = component$(() => {
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
 * See: `useWatch`
 *
 * @public
 */
// </docs>
export interface Tracker {
  // <docs markdown="./watch.public.md#Tracker">
  // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
  // (edit ./watch.public.md#Tracker instead)
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
   * ```typescript
   * export const MyComp = component$(() => {
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
   * See: `useWatch`
   *
   * @public
   */
  // </docs>
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
