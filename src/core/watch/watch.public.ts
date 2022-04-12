import { noSerialize, NoSerialize, removeSub } from '../object/q-object';
import { implicit$FirstArg, QRL } from '../import/qrl.public';
import { getContext } from '../props/props';
import { newInvokeContext, useWaitOn } from '../use/use-core';
import { useHostElement } from '../use/use-host-element.public';
import { logDebug, logError } from '../util/log';
import { then } from '../util/promises';
import { wrapSubscriber } from '../use/use-subscriber';
import { useSequentialScope } from '../use/use-store.public';
import type { QRLInternal } from '../import/qrl-class';
import { getDocument } from '../util/dom';

export const enum WatchMode {
  Watch,
  LayoutEffect,
  Effect,
}

export interface WatchDescriptor {
  isConnected: boolean;
  watchQrl: QRL<(obs: Observer) => void | (() => void)>;
  hostElement: Element;
  mode: WatchMode;
  destroy?: NoSerialize<() => void>;
  running?: NoSerialize<Promise<WatchDescriptor>>;
  dirty: boolean;
}

// <docs markdown="https://hackmd.io/_Kl9br9tT8OB-1Dv8uR4Kg#useWatch">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2F_Kl9br9tT8OB-1Dv8uR4Kg%3Fboth#useWatch instead)
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
 * See: `Observer`
 *
 * @public
 *
 * ## Example
 *
 * The `useWatch` function is used to observe the `state.count` property. Any changes to the
 * `state.count` cause the `watchFn` to execute which in turn updates the `state.doubleCount` to
 * the double of `state.count`.
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
 * @param watch - Function which should be re-executed when changes to the inputs are detected
 * @public
 */
// </docs>
export function useWatchQrl(watchQrl: QRL<(obs: Observer) => void | (() => void)>): void {
  const [watch, setWatch] = useSequentialScope();
  if (!watch) {
    const hostElement = useHostElement();
    const watch: WatchDescriptor = {
      watchQrl: watchQrl,
      hostElement,
      mode: WatchMode.Watch,
      isConnected: true,
      dirty: true,
    };
    setWatch(watch);
    getContext(hostElement).refMap.add(watch);
    useWaitOn(Promise.resolve().then(() => runWatch(watch)));
  }
}

export const isWatchDescriptor = (obj: any): obj is WatchDescriptor => {
  return obj && typeof obj === 'object' && 'watchQrl' in obj;
};

// <docs markdown="https://hackmd.io/_Kl9br9tT8OB-1Dv8uR4Kg#useWatch">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2F_Kl9br9tT8OB-1Dv8uR4Kg%3Fboth#useWatch instead)
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
 * See: `Observer`
 *
 * @public
 *
 * ## Example
 *
 * The `useWatch` function is used to observe the `state.count` property. Any changes to the
 * `state.count` cause the `watchFn` to execute which in turn updates the `state.doubleCount` to
 * the double of `state.count`.
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
 * @param watch - Function which should be re-executed when changes to the inputs are detected
 * @public
 */
// </docs>
export const useWatch$ = implicit$FirstArg(useWatchQrl);

/**
 * @alpha
 */
export function useEffectQrl(watchQrl: QRL<(obs: Observer) => void | (() => void)>): void {
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
  }
}

/**
 * @alpha
 */
export const useEffect$ = implicit$FirstArg(useEffectQrl);

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
      invokationContext.subscriber = watch;

      const watchFn = watch.watchQrl.invokeFn(hostElement, invokationContext);
      const obs = (obj: any) => wrapSubscriber(obj, watch);
      const captureRef = (watch.watchQrl as QRLInternal).captureRef;
      if (Array.isArray(captureRef)) {
        captureRef.forEach((obj) => {
          removeSub(obj, watch);
        });
      }
      return then(watchFn(obs), (returnValue) => {
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
export interface Observer {
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
}
