import type {
  IntrinsicHTMLElements,
  IntrinsicSVGElements,
  QwikHTMLElements,
  QwikSVGElements,
} from './jsx-generated';

export type { QwikIntrinsicAttributes } from './jsx-qwik-attributes';

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
 * Note: It is shorter to use `PropsOf<'div'>`
 *
 * @public
 */
export interface QwikIntrinsicElements extends QwikHTMLElements, QwikSVGElements {}

/**
 * These definitions are for the JSX namespace, they allow passing plain event handlers instead of
 * QRLs
 */
export interface LenientQwikElements extends IntrinsicHTMLElements, IntrinsicSVGElements {}
