import type { HTMLAttributes, IntrinsicHTMLElements } from './jsx-generated';

/** All unknown attributes are allowed */
interface QwikCustomHTMLAttributes<T extends Element> extends HTMLAttributes<T> {
  [key: string]: any;
}

/**
 * Any custom DOM element.
 *
 * @public
 */
interface QwikCustomHTMLElement extends Element {}

/** @public */
export interface QwikIntrinsicAttributes {
  key?: string | number | undefined | null;
}

/**
 * The interface holds available attributes of both native DOM elements and custom Qwik elements. An
 * example showing how to define a customizable wrapper component:
 *
 * ```tsx
 * import { component$, Slot, type QwikIntrinsicElements } from "@builder.io/qwik";
 *
 * type WrapperProps = {
 *   attributes?: QwikIntrinsicElements["div"];
 * };
 *
 * export default component$<WrapperProps>(({ attributes }) => {
 *   return (
 *     <div {...attributes} class="p-2">
 *       <Slot />
 *     </div>
 *   );
 * });
 * ```
 *
 * @public
 */
export interface QwikIntrinsicElements extends IntrinsicHTMLElements {
<<<<<<< Updated upstream
  /**
   * Custom DOM elements can have any name We need to add the empty object to match the type with
   * the Intrinsic elements
   */
  [key: string]: {} | QwikCustomHTMLAttributes<QwikCustomHTMLElement>;
=======
  // We need to add `{}` to match the type with the Intrinsic elements
  /** Custom DOM elements can have any name */
  [key: string]: QwikCustomHTMLAttributes<QwikCustomHTMLElement> | {} | null;
>>>>>>> Stashed changes
}
