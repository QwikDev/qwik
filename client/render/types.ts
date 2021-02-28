/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

/**
 * Rendering can happen asynchronously. For this reason rendering keeps track of all of the
 * asynchronous render elements. This promise is than flatten before being returned as `As
 */
export type AsyncHostElementPromises = Array<Element | Promise<Element | AsyncHostElementPromises>>;

/**
 * After rendering completes the `jsxRender` asynchronously returns a list of host elements
 * rendered asynchronously.
 */
export type HostElements = Element[];
