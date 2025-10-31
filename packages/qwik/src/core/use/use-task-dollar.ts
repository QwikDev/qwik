import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import { useTaskQrl, type TaskFn, type TaskOptions } from './use-task';

// <docs markdown="../readme.md#useTask">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useTask instead and run `pnpm docs.sync`)
/**
 * Reruns the `taskFn` when the observed inputs change.
 *
 * Use `useTask` to observe changes on a set of inputs, and then re-execute the `taskFn` when those
 * inputs change.
 *
 * The `taskFn` only executes if the observed inputs change. To observe the inputs, use the `obs`
 * function to wrap property reads. This creates subscriptions that will trigger the `taskFn` to
 * rerun.
 *
 * @param task - Function which should be re-executed when changes to the inputs are detected
 * @public
 *
 * ### Example
 *
 * The `useTask` function is used to observe the `store.count` property. Any changes to the
 * `store.count` cause the `taskFn` to execute which in turn updates the `store.doubleCount` to
 * the double of `store.count`.
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({
 *     count: 0,
 *     doubleCount: 0,
 *     debounced: 0,
 *   });
 *
 *   // Double count task
 *   useTask$(({ track }) => {
 *     const count = track(() => store.count);
 *     store.doubleCount = 2 * count;
 *   });
 *
 *   // Debouncer task
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
 * @public
 * @see `Tracker`
 */
// </docs>
// We need to cast to help out the api extractor
export const useTask$ = /*#__PURE__*/ implicit$FirstArg(useTaskQrl) as (
  fn: TaskFn,
  opts?: TaskOptions
) => void;
