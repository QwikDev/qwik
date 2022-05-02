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
import { qPropWriteQRL } from '../props/props-on';
import { useOn, useResumeQrl } from '../component/component.public';

export const enum WatchMode {
  Watch,
  LayoutEffect,
  Effect,
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
  isConnected: boolean;
  watchQrl: QRL<WatchFn>;
  hostElement: Element;
  mode: WatchMode;
  destroy?: NoSerialize<() => void>;
  running?: NoSerialize<Promise<WatchDescriptor>>;
  dirty: boolean;
}

export const isWatchDescriptor = (obj: any): obj is WatchDescriptor => {
  return obj && typeof obj === 'object' && 'watchQrl' in obj;
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
export function useEffectQrl(watchQrl: QRL<WatchFn>, opts?: UseEffectOptions): void {
  const [watch, setWatch] = useSequentialScope();
  if (!watch) {
    const hostElement = useHostElement();
    const watch: WatchDescriptor = {
      watchQrl: watchQrl,
      hostElement,
      mode: WatchMode.Effect,
      isConnected: true,
      dirty: true,
    };
    setWatch(watch);
    getContext(hostElement).refMap.add(watch);
    const run = opts?.run;
    if (run) {
      const watchHandler = new QRLInternal(
        (watchQrl as QRLInternal).chunk,
        'handleWatch',
        handleWatch,
        null,
        null,
        [watch]
      );
      watchHandler.refSymbol = (watchQrl as QRLInternal).symbol;
      if (opts?.run === 'load') {
        useResumeQrl(watchHandler);
      } else {
        useOn('qVisible', watchHandler);
      }
    }
  }
}

/**
 * @alpha
 */
export const useEffect$ = implicit$FirstArg(useEffectQrl);

/**
 * @alpha
 */
export function useClientEffectQrl(watchQrl: QRL<WatchFn>, opts?: UseEffectOptions): void {
  const [watch, setWatch] = useSequentialScope();
  if (!watch) {
    const hostElement = useHostElement();
    const isServer = getPlatform(useDocument()).isServer;
    const watch: WatchDescriptor = {
      watchQrl: watchQrl,
      hostElement,
      mode: WatchMode.Effect,
      isConnected: true,
      dirty: !isServer,
    };
    setWatch(watch);
    getContext(hostElement).refMap.add(watch);
    if (isServer) {
      const watchHandler = new QRLInternal(
        (watchQrl as QRLInternal).chunk,
        'handleWatch',
        handleWatch,
        null,
        null,
        [watch]
      );
      watchHandler.refSymbol = (watchQrl as QRLInternal).symbol;
      if (opts?.run === 'load') {
        useResumeQrl(watchHandler);
      } else {
        useOn('qVisible', watchHandler);
      }
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
export function useServerQrl(watchQrl: QRL<ServerFn>): void {
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
export const useServer$ = implicit$FirstArg(useServerQrl);

export function runWatch(watch: WatchDescriptor): Promise<WatchDescriptor> {
  if (!watch.dirty) {
    logDebug('Watch is not dirty, skipping run', watch);
    return Promise.resolve(watch);
  }
  watch.dirty = false;

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
      const hostElement = watch.hostElement;
      const invokationContext = newInvokeContext(
        getDocument(hostElement),
        hostElement,
        hostElement,
        'WatchEvent'
      );
      invokationContext.watch = watch;

      const watchFn = watch.watchQrl.invokeFn(hostElement, invokationContext);
      const tracker: Tracker = (obj: any, prop?: string) => {
        obj[SetSubscriber] = watch;
        if (prop) {
          return obj[prop];
        } else {
          return obj[QOjectAllSymbol];
        }
      };
      const captureRef = (watch.watchQrl as QRLInternal).captureRef;
      if (Array.isArray(captureRef)) {
        captureRef.forEach((obj) => {
          removeSub(obj, watch);
        });
      }
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

// <docs markdown="https://hackmd.io/_Kl9br9tT8OB-1Dv8uR4Kg#Observer">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2F_Kl9br9tT8OB-1Dv8uR4Kg%3Fboth#Observer instead)
/**
 * Used to signal to Qwik which state should be watched for changes.
 *
 * The `Observer` is passed into the `watchFn` of `useWatch`. It is intended to be used to wrap
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
 *   useWatch$((obs) => {
 *     store.doubleCount = 2 * obs(store).count;
 *   });
 *   return $(() => (
 *     <div>
 *       <span>
 *         {store.count} / {store.doubleCount}
 *       </span>
 *       <button onClick$={() => store.count++}>+</button>
 *     </div>
 *   ));
 * });
 * ```
 *
 *
 * See: `useWatch`
 *
 * @public
 */
// </docs>
export interface Tracker {
  // <docs markdown="https://hackmd.io/_Kl9br9tT8OB-1Dv8uR4Kg#Observer">
  // !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
  // (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2F_Kl9br9tT8OB-1Dv8uR4Kg%3Fboth#Observer instead)
  /**
   * Used to signal to Qwik which state should be watched for changes.
   *
   * The `Observer` is passed into the `watchFn` of `useWatch`. It is intended to be used to wrap
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
   *   useWatch$((obs) => {
   *     store.doubleCount = 2 * obs(store).count;
   *   });
   *   return $(() => (
   *     <div>
   *       <span>
   *         {store.count} / {store.doubleCount}
   *       </span>
   *       <button onClick$={() => store.count++}>+</button>
   *     </div>
   *   ));
   * });
   * ```
   *
   *
   * See: `useWatch`
   *
   * @public
   */
  // </docs>
  <T extends {}>(obj: T): T;
  <T extends {}, B extends keyof T>(obj: T, prop: B): T[B];
}
