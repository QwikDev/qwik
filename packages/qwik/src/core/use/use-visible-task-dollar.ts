import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { TaskFn } from './use-task';
import { useVisibleTaskQrl, type OnVisibleTaskOptions } from './use-visible-task';

// <docs markdown="../readme.md#useVisibleTask">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useVisibleTask instead and run `pnpm docs.sync`)
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
 * Visible Tasks are a variant of Tasks that only run in the browser, and are registered but not
 * executed during SSR. They are useful for running code that should only execute in the browser,
 * such as code that interacts with the DOM or browser APIs.
 *
 * Cleanup callbacks registered with `cleanup()` or returned from the task may be async. When a
 * visible task reruns, Qwik waits for the previous cleanup to finish before starting the next
 * invocation.
 *
 * @public
 */
// </docs>
// We need to cast to help out the api extractor
export const useVisibleTask$ = /*#__PURE__*/ implicit$FirstArg(useVisibleTaskQrl) as (
  fn: TaskFn,
  opts?: OnVisibleTaskOptions
) => void;
