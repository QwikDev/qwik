import type { QRLInternal } from '../import/qrl-class';
import { implicit$FirstArg, QRL } from '../import/qrl.public';
import { useHostElement } from '../use/use-host-element.public';
import { useProps } from '../use/use-props.public';
import { registerOnWatch, WatchFn } from './watch';

// <docs markdown="https://hackmd.io/_Kl9br9tT8OB-1Dv8uR4Kg#onWatch">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit https://hackmd.io/_Kl9br9tT8OB-1Dv8uR4Kg#onWatch instead)
/**
 * Reruns the `watchFn` when the observed inputs change.
 *
 * Use `onWatch` to observe changes on a set of inputs, and then re-execute the `watchFn` when
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
 * The `onWatch` function is used to observe the `state.count` property. Any changes to the
 * `state.count` cause the `watchFn` to execute which in turn updates the `state.doubleCount` to
 * the double of `state.count`.
 *
 * ```typescript
 * export const MyComp = component$(() => {
 *   const store = createStore({ count: 0, doubleCount: 0 });
 *   onWatch$((obs) => {
 *     store.doubleCount = 2 * obs(store).count;
 *   });
 *   return $(() => (
 *     <div>
 *       <span>
 *         {store.count} / {store.doubleCount}
 *       </span>
 *       <button on$:click={() => store.count++}>+</button>
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
export function onWatch(watchFn: QRL<(obs: Observer) => unknown | (() => void)>): void {
  registerOnWatch(useHostElement(), useProps(), watchFn as QRLInternal<WatchFn>);
}

// <docs markdown="https://hackmd.io/_Kl9br9tT8OB-1Dv8uR4Kg#onWatch">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit https://hackmd.io/_Kl9br9tT8OB-1Dv8uR4Kg#onWatch instead)
/**
 * Reruns the `watchFn` when the observed inputs change.
 *
 * Use `onWatch` to observe changes on a set of inputs, and then re-execute the `watchFn` when
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
 * The `onWatch` function is used to observe the `state.count` property. Any changes to the
 * `state.count` cause the `watchFn` to execute which in turn updates the `state.doubleCount` to
 * the double of `state.count`.
 *
 * ```typescript
 * export const MyComp = component$(() => {
 *   const store = createStore({ count: 0, doubleCount: 0 });
 *   onWatch$((obs) => {
 *     store.doubleCount = 2 * obs(store).count;
 *   });
 *   return $(() => (
 *     <div>
 *       <span>
 *         {store.count} / {store.doubleCount}
 *       </span>
 *       <button on$:click={() => store.count++}>+</button>
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
export const onWatch$ = implicit$FirstArg(onWatch);

// <docs markdown="https://hackmd.io/_Kl9br9tT8OB-1Dv8uR4Kg#Observer">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit https://hackmd.io/_Kl9br9tT8OB-1Dv8uR4Kg#Observer instead)
/**
 * Used to signal to Qwik which state should be watched for changes.
 *
 * The `Observer` is passed into the `watchFn` of `onWatch`. It is intended to be used to wrap
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
 *   const store = createStore({ count: 0, doubleCount: 0 });
 *   onWatch$((obs) => {
 *     store.doubleCount = 2 * obs(store).count;
 *   });
 *   return $(() => (
 *     <div>
 *       <span>
 *         {store.count} / {store.doubleCount}
 *       </span>
 *       <button on$:click={() => store.count++}>+</button>
 *     </div>
 *   ));
 * });
 * ```
 *
 *
 * See: `onWatch`
 *
 * @public
 */
// </docs>
export interface Observer {
  // <docs markdown="https://hackmd.io/_Kl9br9tT8OB-1Dv8uR4Kg#Observer">
  // !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit https://hackmd.io/_Kl9br9tT8OB-1Dv8uR4Kg#Observer instead)
  /**
   * Used to signal to Qwik which state should be watched for changes.
   *
   * The `Observer` is passed into the `watchFn` of `onWatch`. It is intended to be used to wrap
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
   *   const store = createStore({ count: 0, doubleCount: 0 });
   *   onWatch$((obs) => {
   *     store.doubleCount = 2 * obs(store).count;
   *   });
   *   return $(() => (
   *     <div>
   *       <span>
   *         {store.count} / {store.doubleCount}
   *       </span>
   *       <button on$:click={() => store.count++}>+</button>
   *     </div>
   *   ));
   * });
   * ```
   *
   *
   * See: `onWatch`
   *
   * @public
   */
  // </docs>
  <T extends {}>(obj: T): T;
}
