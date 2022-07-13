import type { HTMLAttributes } from './types/jsx-generated';
import type { FunctionComponent } from './types/jsx-node';

export interface HostAttributes extends HTMLAttributes<HTMLElement> {
  [key: string]: any;
}
/**
 * @public
 */
export type JSXTagName = keyof HTMLElementTagNameMap | Omit<string, keyof HTMLElementTagNameMap>;

/**
 * Place at the root of the component View to allow binding of attributes on the Host element.
 *
 * ```
 * <Host someAttr={someExpr} someAttrStatic="value">
 *   View content implementation.
 * </Host>
 * ```
 *
 * Qwik requires that components have [docs/HOST_ELEMENTS.ts] so that it is possible to have
 * asynchronous loading point. Host element is not owned by the component. At times it is
 * desirable for the component to render additional attributes on the host element. `<Host>`
 * servers that purpose.
 * @public
 */
<<<<<<< HEAD
export const Host: FunctionComponent<HostAttributes> = { __brand__: 'host' } as any;
=======
export const Host: FunctionComponent<HTMLAttributes<HTMLElement> & { tagName?: JSXTagName }> = {
  __brand__: 'host',
} as any;
>>>>>>> Expose tagName on Host component and host:tagName

/**
 * @public
 */
export const SkipRerender: FunctionComponent<{}> = { __brand__: 'skip' } as any;
