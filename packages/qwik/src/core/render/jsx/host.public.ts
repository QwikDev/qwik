import type { HTMLAttributes } from './types/jsx-generated';
import type { FunctionComponent } from './types/jsx-node';

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
export const Host: FunctionComponent<HTMLAttributes<HTMLElement>> = { __brand__: 'host' } as any;

/**
 * @public
 */
export const SkipRerender: FunctionComponent<{}> = { __brand__: 'skip' } as any;
