import type { HTMLAttributes, IntrinsicHTMLElements, ScriptHTMLAttributes } from './jsx-generated';

interface QwikScriptHTMLAttributes<T> extends ScriptHTMLAttributes<T> {
  events?: string[];
}

interface QwikCustomHTMLAttributes<T> extends HTMLAttributes<T> {
  [key: string]: any;
}

interface QwikCustomHTMLElement extends HTMLElement {}

/**
 * @public
 */
export interface QwikIntrinsicAttributes {
  key?: string | number | undefined | null;
}

/**
 * The interface holds available attributes of both native DOM elements and custom Qwik elements.
 * An example showing how to define a customizable wrapper component:
 *
 * ```tsx
 * import { component$, Slot, type QwikIntrinsicElements } from "@builder.io/qwik";
 *
 * type WrapperProps = {
 *   attributes?: QwikIntrinsicElements["div"];
 * };
 *
 * const Wrapper = component$<WrapperProps>(({ attributes }) => {
 *   return (
 *     <div {...attributes} class="p-2">
 *       <Slot />
 *     </div>
 *   );
 * });
 * ```
 * @public
 */
export interface QwikIntrinsicElements extends IntrinsicHTMLElements {
  script: QwikScriptHTMLAttributes<HTMLScriptElement>;
  [key: string]: QwikCustomHTMLAttributes<QwikCustomHTMLElement>;
}
