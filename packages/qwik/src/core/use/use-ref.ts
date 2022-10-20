import { useStore } from './use-store.public';

/**
 * Type of the value returned by `useRef()`.
 *
 * @alpha
 */
export interface Ref<T = Element> {
  current: T | undefined;
}

// <docs markdown="../readme.md#useRef">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useRef instead)
/**
 * It's a very thin wrapper around `useStore()`, including the proper type signature to be passed
 * to the `ref` property in JSX.
 *
 * ```tsx
 * export function useRef<T = Element>(current?: T): Ref<T> {
 *   return useStore({ current });
 * }
 * ```
 *
 * ### Example
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const input = useRef<HTMLInputElement>();
 *
 *   useClientEffect$(({ track }) => {
 *     const el = track(() => input.current)!;
 *     el.focus();
 *   });
 *
 *   return (
 *     <div>
 *       <input type="text" ref={input} />
 *     </div>
 *   );
 * });
 *
 * ```
 *
 * @deprecated Use `useSignal` instead.
 * @alpha
 */
// </docs>
export const useRef = <T extends Element = Element>(current?: T): Ref<T> => {
  return useStore({ current });
};
