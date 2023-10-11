import type { HTMLAttributes, IntrinsicHTMLElements } from './jsx-generated';

interface QwikCustomHTMLAttributes<T extends Element> extends HTMLAttributes<T> {
  [key: string]: any;
}

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
  [key: string]: QwikCustomHTMLAttributes<QwikCustomHTMLElement>;
}
