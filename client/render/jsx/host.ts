/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { JSXNode } from './types.js';

/**
 * Place at the root of the component View to allow binding of attributes on the Host element.
 *
 * ```
 * <Host someAttr={someExpr} someAttrStatic="value">
 *   View content implementation.
 * </Host>
 * ```
 *
 * Qoot requires that components have [docs/HOST_ELEMENTS.ts] so that it is possible to have
 * asynchronous loading point. Host element is not owned by the component. At times it is
 * desirable for the component to render additional attributes on the host element. `<Host>`
 * servers that purpose.
 * @public
 */
export function Host(): JSXNode<any> {
  // TODO: QError?
  throw new Error('Should not execute');
}
