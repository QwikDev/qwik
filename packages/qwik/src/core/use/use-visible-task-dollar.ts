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
 * @public
 */
// </docs>
// We need to cast to help out the api extractor
export const useVisibleTask$ = /*#__PURE__*/ implicit$FirstArg(useVisibleTaskQrl) as (
  fn: TaskFn,
  opts?: OnVisibleTaskOptions
) => void;
